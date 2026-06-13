// Ellipsis: dual value+namespace, matches @gajae-code/natives export
const EllipsisValue = '…';
export const Ellipsis: string & { Unicode: string; Ascii: string; Omit: string } = Object.assign(
    EllipsisValue,
    { Unicode: '…', Ascii: '...', Omit: '⋯' },
);
export type Ellipsis = string;

export function nativeHighlightCode(code: string, _lang: string): string { return code; }
export function encodeSixel(_data: Uint8Array, _w: number, _h: number): string { return ""; }
