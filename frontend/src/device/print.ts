// Device print abstraction
export function triggerDevicePrint() {
  if (typeof window !== 'undefined' && window.print) {
    window.print();
  }
}
