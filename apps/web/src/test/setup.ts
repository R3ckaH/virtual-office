import '@testing-library/jest-dom/vitest';

// jsdom lacks <dialog> methods. (Skipped for tests that run in the plain Node environment.)
if (typeof HTMLDialogElement !== 'undefined') {
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.open = false;
  };
}
