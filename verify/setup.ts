// Side-effect module: installs a jsdom DOM plus the handful of browser APIs
// the UI touches that jsdom does not implement. Must be imported FIRST by
// every test entry, before React or any app module.
import { JSDOM } from "jsdom";

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: "https://tjblech.github.io/Billiards/",
  pretendToBeVisual: true,
});

// Node 22 defines some of these as getter-only globals, so assignment throws
// in ESM strict mode — define them instead.
const define = (key: string, value: unknown) => {
  Object.defineProperty(globalThis, key, { value, writable: true, configurable: true });
};

const { window } = dom;

define("window", window);
define("document", window.document);
define("navigator", window.navigator);
define("localStorage", window.localStorage);
define("sessionStorage", window.sessionStorage);
define("HTMLElement", window.HTMLElement);
define("HTMLInputElement", window.HTMLInputElement);
define("HTMLTextAreaElement", window.HTMLTextAreaElement);
define("Element", window.Element);
define("Node", window.Node);
define("MouseEvent", window.MouseEvent);
define("KeyboardEvent", window.KeyboardEvent);
define("Event", window.Event);
define("Blob", window.Blob);
define("getComputedStyle", window.getComputedStyle.bind(window));
define("requestAnimationFrame", (cb: FrameRequestCallback) => setTimeout(() => cb(Date.now()), 0));
define("cancelAnimationFrame", (id: number) => clearTimeout(id));
define("IS_REACT_ACT_ENVIRONMENT", true);

class RO { observe() {} unobserve() {} disconnect() {} }
(window as unknown as Record<string, unknown>).ResizeObserver = RO;
define("ResizeObserver", RO);

Object.defineProperty(window.navigator, "clipboard", {
  value: { writeText: async () => {} },
  configurable: true,
});
window.URL.createObjectURL = () => "blob:mock";
window.URL.revokeObjectURL = () => {};
window.document.documentElement.requestFullscreen = async () => {};
window.document.exitFullscreen = async () => {};
