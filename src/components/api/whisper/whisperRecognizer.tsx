import { Recognizer } from '../recognizer';
import { TranscriptBlock } from '../../../react-redux&middleware/redux/types/TranscriptTypes';
import makeWhisper from './libstream';
import { loadRemote } from './indexedDB'
import { SIPOAudioBuffer } from './sipo-audio-buffer';
import { MicVAD } from '@ricky0123/vad-web';
/**
 * Wrapper for Web Assembly implementation of whisper.cpp
 */
export class WhisperRecognizer implements Recognizer {

    //
    // Audio params
    //
    private kSampleRate = 16000;
    // Length of the suffix of the captured audio that whisper processes each time (in seconds)
    private kWindowLength = 5;
    // Number of samples in each audio chunk the audio worklet receives
    private kChunkLength = 128;

    /**
     * Audio context and buffer used to capture speech
     */
    private context: AudioContext;
    private audio_buffer: SIPOAudioBuffer;
    
    /**
     * Instance of the whisper wasm module, and its variables
     */
    private whisper: any = null;
    private model_name: string = "";
    private model_index: Number = -1;
    private language: string = "en";
    private num_threads: number;

    /**
     * The VAD module used to start and stop recording
     */
    private vad: MicVAD | null = null;

    private transcribed_callback: ((newFinalBlocks: Array<TranscriptBlock>, newInProgressBlock: TranscriptBlock) => void) | null = null;

    /**
     * Creates an Whisper recognizer instance that listens to the default microphone
     * and expects speech in the given language 
     * @param audioSource Not implemented yet
     * @param language Not implemented yet
     * @parem num_threads Number of worker threads that whisper uses
     */
    constructor(audioSource: any, language: string, num_threads: number = 4, model: string = "tiny-en-q5_1") {
        this.num_threads = num_threads;
        this.language = language;
        this.model_name = model;

        const num_chunks = this.kWindowLength * this.kSampleRate / this.kChunkLength;
        this.audio_buffer = new SIPOAudioBuffer(num_chunks, this.kChunkLength);

        this.context = new AudioContext({
            sampleRate: this.kSampleRate,
        });
    }

    private print = (text: string) => {
        if (this.transcribed_callback != null) {
            let block = new TranscriptBlock();
            block.text = text;
            this.transcribed_callback([block], new TranscriptBlock());
        }
    }

    private printDebug = (text: string) => {
        console.log(text);
    }

    private storeFS(fname, buf) {
        // write to WASM file using FS_createDataFile
        // if the file exists, delete it
        try {
            this.whisper.FS_unlink(fname);
        } catch (e) {
            // ignore
        }
        this.whisper.FS_createDataFile("/", fname, buf, true, true);
        this.printDebug('storeFS: stored model: ' + fname + ' size: ' + buf.length);
    }


    /**
     * Async load the WASM module, ggml model, and Audio Worklet needed for whisper to work
     */
    public async loadWhisper() {
        // Load wasm and ggml
        this.whisper = await makeWhisper({
            print: this.print,
            printErr: this.printDebug,
            setStatus: function(text) {
                this.printErr('js: ' + text);
            },
            monitorRunDependencies: function(left) {
            }
        })
        await this.load_model(this.model_name);
        this.model_index = this.whisper.init('whisper.bin');

        console.log("Whisper: Done instantiating whisper", this.whisper, this.model_index);

        // Set up audio source
        let mic_stream = await navigator.mediaDevices.getUserMedia({audio: true, video: false});
        let source = this.context.createMediaStreamSource(mic_stream);
        
        // Set up PCM audio recorder
        await this.context.audioWorklet.addModule(process.env.PUBLIC_URL + "/raw-recorder.js");
        let raw_recorder = new AudioWorkletNode(this.context, "raw-recorder");
        source.connect(raw_recorder);
        raw_recorder.port.onmessage = this.process_recorder_message.bind(this);

        console.log("Whisper: Done setting up audio context");

        // HACK: VAD files were manually copied into the public folder
        // TODO: add copy commands to the build script
        this.vad = await MicVAD.new({
            workletURL: process.env.PUBLIC_URL + "/vad/vad.worklet.bundle.min.js",
            modelURL: process.env.PUBLIC_URL + "/vad/silero_vad.onnx",
            onSpeechEnd: this.on_speech_end.bind(this),
            redemptionFrames: 4,
        })
        
    }

    private async load_model(model: string) {
        let urls = {
            'tiny.en':  'ggml-model-whisper-tiny.en.bin',
            'tiny':     'ggml-model-whisper-tiny.bin',
            'base.en':  'ggml-model-whisper-base.en.bin',
            'base':     'ggml-model-whisper-base.bin',
            'small.en': 'ggml-model-whisper-small.en.bin',
            'small':    'ggml-model-whisper-small.bin',

            'tiny-en-q5_1':  'ggml-model-whisper-tiny.en-q5_1.bin',
            'tiny-q5_1':     'ggml-model-whisper-tiny-q5_1.bin',
            'base-en-q5_1':  'ggml-model-whisper-base.en-q5_1.bin',
            'base-q5_1':     'ggml-model-whisper-base-q5_1.bin',
            'small-en-q5_1': 'ggml-model-whisper-small.en-q5_1.bin',
            'small-q5_1':    'ggml-model-whisper-small-q5_1.bin',
            'medium-en-q5_0':'ggml-model-whisper-medium.en-q5_0.bin',
            'medium-q5_0':   'ggml-model-whisper-medium-q5_0.bin',
            'large-q5_0':    'ggml-model-whisper-large-q5_0.bin',
        };
        let sizes = {
            'tiny.en':  75,
            'tiny':     75,
            'base.en':  142,
            'base':     142,
            'small.en': 466,
            'small':    466,

            'tiny-en-q5_1':   31,
            'tiny-q5_1':      31,
            'base-en-q5_1':   57,
            'base-q5_1':      57,
            'small-en-q5_1':  182,
            'small-q5_1':     182,
            'medium-en-q5_0': 515,
            'medium-q5_0':    515,
            'large-q5_0':     1030,
        };

        let url     = process.env.PUBLIC_URL + "/models/" + urls[model];
        let dst     = 'whisper.bin';
        let size_mb = sizes[model];

        // HACK: turn loadRemote into a promise so that we can chain .then
        let that = this;
        return new Promise<void>((resolve, reject) => {
            loadRemote(url, 
                dst, 
                size_mb, 
                (text) => {},
                (fname, buf) => {
                    that.storeFS(fname, buf);
                    resolve();
                },
                () => {
                    reject();
                },
                that.printDebug,
            );
        })
    }

    /**
     * Helper method that stores audio chunks from the raw recorder in buffer
     * @param message Message object containing an audio chunk
     */
    private process_recorder_message(message: MessageEvent) {
        const audio_chunk = new Float32Array(message.data);
        this.audio_buffer.push(audio_chunk);
        if (this.audio_buffer.isFull()) {
            // this.whisper.set_audio(this.model_index, this.audio_buffer.getAll());
            this.audio_buffer.clear();
        }
    }

    private on_speech_end(audio: Float32Array) {
        console.log("Whisper VAD: speech ended, audio length (s):", audio.length / this.kSampleRate);
        this.whisper.set_audio(this.model_index, audio);
    }

    /**
     * Makes the Whisper recognizer start transcribing speech, if not already started
     * Throws exception if recognizer fails to start
     */
    start() {
        console.log("trying to start whisper");
        let that = this;
        if (this.whisper == null || this.model_index == -1) {
            console.warn("Cannot find whisper instance, instantiating one...", this.whisper, this.model_index);
            this.loadWhisper().then(() => {
                that.whisper.setStatus("");
                that.context.resume();
                that.vad?.start();
            })
        } else {
            this.whisper.setStatus("");
            this.context.resume();
            that.vad?.start();
        }
    }

    /**
     * Makes the Whisper recognizer stop transcribing speech asynchronously
     * Throws exception if recognizer fails to stop
     */
    stop() {
        if (this.whisper == null || this.model_index === -1) {
            return;
        }
        this.whisper.set_status("paused");
        this.context.suspend();
        this.vad?.pause();
    }

    /**
     * Subscribe a callback function to the transcript update event, which is usually triggered
     * when the recognizer has processed more speech or finalized some in-progress part
     * @param callback A callback function called with updates to the transcript
     */
    onTranscribed(callback: (newFinalBlocks: Array<TranscriptBlock>, newInProgressBlock: TranscriptBlock) => void) {
        this.transcribed_callback = callback;
    }

    /**
     * Subscribe a callback function to the error event, which is triggered
     * when the recognizer has encountered an error
     * @param callback A callback function called with the error object when the event is triggered
     */
    onError(callback: (e: Error) => void) {
        
    }

}

