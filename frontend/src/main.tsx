import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";

// #region agent log
fetch('http://127.0.0.1:7437/ingest/f3a2e4ac-fced-4069-852f-95b203a709d9',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'e1dcb5'},body:JSON.stringify({sessionId:'e1dcb5',location:'main.tsx:entry',message:'script running before createRoot',data:{hasRoot:!!document.getElementById('root')},timestamp:Date.now(),hypothesisId:'C'})}).catch(()=>{});
// #endregion
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);