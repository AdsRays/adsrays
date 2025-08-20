// src/index.js — чистый клиентский код React
import React from "react";
import ReactDOM from "react-dom";
import "./index.css"; // если у тебя есть стили
import App from "./App";

ReactDOM.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
  document.getElementById("root")
);
