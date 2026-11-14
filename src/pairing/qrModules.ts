import qrcode from "qrcode-generator";

/** A QR's dark modules, row by row. Level H, as the owl covers the middle. Alphanumeric mode when the code is upper case. */
export function qrModules(text: string): boolean[][] {
  const qr = qrcode(0, "H");
  qr.addData(text, /^[0-9A-Z $%*+\-./:]*$/.test(text) ? "Alphanumeric" : "Byte");
  qr.make();
  const size = qr.getModuleCount();
  return Array.from({ length: size }, (_, row) => Array.from({ length: size }, (_, col) => qr.isDark(row, col)));
}
