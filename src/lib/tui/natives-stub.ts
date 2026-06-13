export const Ellipsis = '…' as const;
export type Ellipsis = typeof Ellipsis;
export namespace Ellipsis { export const Unicode = '…'; export const Ascii = '...'; }
export function nativeHighlightCode(code: string, _lang: string): string { return code; }
export function encodeSixel(_data: Uint8Array, _w: number, _h: number): string { return ""; }
