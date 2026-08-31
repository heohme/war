import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./compat.css";
import "../app/globals.css";
import App from "./App";

function updateAppHeight() {
  const height = window.visualViewport ? window.visualViewport.height : window.innerHeight;
  document.documentElement.style.setProperty("--app-height", `${height}px`);
}

function supportsFlexGap() {
  const flex = document.createElement("div");
  flex.style.position = "absolute";
  flex.style.visibility = "hidden";
  flex.style.display = "flex";
  flex.style.flexDirection = "column";
  flex.style.rowGap = "1px";
  flex.appendChild(document.createElement("div"));
  flex.appendChild(document.createElement("div"));
  document.body.appendChild(flex);
  const supported = flex.scrollHeight === 1;
  if (flex.parentNode) flex.parentNode.removeChild(flex);
  return supported;
}

updateAppHeight();
window.addEventListener("resize", updateAppHeight);
if (window.visualViewport) window.visualViewport.addEventListener("resize", updateAppHeight);
if (supportsFlexGap()) document.documentElement.classList.add("supports-flex-gap");

const root = document.getElementById("root");
if (!root) throw new Error("root_not_found");
createRoot(root).render(<StrictMode><App /></StrictMode>);
