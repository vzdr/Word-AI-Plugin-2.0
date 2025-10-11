import * as React from 'react';
import * as ReactDOM from 'react-dom';
import App from './App';

Office.onReady((info) => {
  if (info.host === Office.HostType.Word) {
    ReactDOM.render(<App />, document.getElementById('root'));
  }
});
