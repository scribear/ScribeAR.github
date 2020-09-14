import React from 'react'
import { useSelector, useDispatch } from 'react-redux'
import './index.css'
import Button from '@material-ui/core/Button';
import { flip_on_webspeech } from '../../redux/actions'

export default function SwitchAPI(props) {
     const onWebspeech = (state) => state.onWebspeech
     const wantsWebspeech = useSelector(onWebspeech)// Get current value of recording.
     // useDispatch returns the state modifying function, invoked below.
     const dispatch = useDispatch()
     // record-btn-wrapper toggles between the two buttons using the TopSpace
     // hidden/shown CSS.
     if (wantsWebspeech == false) {
        return(
            <div className = 'item-wrap-sw'>
                Source
                  <Button className = 'Switch' color= "inherit" size = "medium" variant = 'outlined' onClick={() => dispatch(flip_on_webspeech())} >
                        Azure
                  </Button>
            </div>
        )
     } else {
        return(
            <div className = 'item-wrap-sw'>
                Source
                  <Button className = 'Switch' color= "inherit" size = "medium" variant = 'outlined' onClick={() => dispatch(flip_on_webspeech())}>
                        WebSpeech
                  </Button>
            </div>
        )
    }
}
