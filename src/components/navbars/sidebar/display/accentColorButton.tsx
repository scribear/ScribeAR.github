import React, { useState, useRef } from 'react';
import {Button, FormatColorTextIcon } from '../../../../muiImports';
import { RootState, DisplayStatus } from '../../../../react-redux&middleware/redux/typesImports';
import { useDispatch, useSelector } from 'react-redux';

export default function AccentColorButton() {
    const color = useSelector((state: RootState) => {
      return state.DisplayReducer as DisplayStatus;
    });
    const [selectedColor, setSelectedColor] = useState(color.secondaryColor);
    const dispatch = useDispatch();
    const position = useSelector((state: RootState) => {
      return state.DisplayReducer as DisplayStatus;
    });
    const handleInputChange = (event) => {
      dispatch({ type: 'CHANGE_SECONDARY_THEME', payload: event });
    }

    const inputRef = useRef<HTMLInputElement>(null);

    const handleButtonClick = (event) => {
      console.log("accent color button click");
      inputRef.current?.click(); 
    };

    const handleColorChange = (event) => {
      const selectedColor = event.target.value;
      console.log("accent selected color:", selectedColor);
      handleInputChange(event.target.value);
      setSelectedColor(selectedColor);
    };
  
    return (
        <Button id="demo-customized-button" variant="contained" disableElevation sx={{ width: 50, height: 30 }} onClick={handleButtonClick}>
            <input ref={inputRef} type="color" value={selectedColor} onChange={handleColorChange} />
            {/* {<FormatColorTextIcon />} */}
        </Button>
    );
};