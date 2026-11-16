import { expect, test } from 'bun:test';
import { readUploadRaster, uploadRasterBytes } from './raster.ts';
import { inspectUploadSource, maxUploadSourceBytes } from './source.ts';

test('pixel contract accepts exact canonical RGBA only and never executes foreign getters', () => {
  const raster = { width: 1, height: 1, rgba: '/wAA/w==' };
  expect(readUploadRaster(raster)).toEqual(raster);
  expect([...uploadRasterBytes(raster)]).toEqual([255, 0, 0, 255]);
  for (const value of [null, [], new Date(), { ...raster, url: 'https://example.com' },
    { ...raster, width: 129 }, { ...raster, width: 0 }, { ...raster, height: 1.5 },
    { ...raster, rgba: '/wAA/x==' }, { ...raster, rgba: '/wAA/w' }, { ...raster, rgba: ' /wAA/w==' },
    { ...raster, rgba: 'data:image/png;base64,/wAA/w==' }, { ...raster, width: NaN }]) {
    expect(() => readUploadRaster(value)).toThrow();
  }
  let called = false;
  expect(() => readUploadRaster({ width: 1, height: 1, get rgba() { called = true;return '/wAA/w=='; } })).toThrow();
  expect(called).toBe(false);
  expect(readUploadRaster({ width: 128, height: 128, rgba: btoa('\0'.repeat(65536)) }).rgba.length).toBe(87384);
});

function png(width = 64, height = 32, extra?: string) {
  const chunks: Uint8Array[] = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])];
  const header = new Uint8Array(13), view = new DataView(header.buffer);view.setUint32(0, width);view.setUint32(4, height);
  for (const [type, data] of [['IHDR', header], ...(extra ? [[extra, new Uint8Array(8)]] as const : []), ['IDAT', new Uint8Array(1)], ['IEND', new Uint8Array()]] as const) {
    const chunk = new Uint8Array(12 + data.length);new DataView(chunk.buffer).setUint32(0, data.length);
    chunk.set(new TextEncoder().encode(type), 4);chunk.set(data, 8);chunks.push(chunk);
  }
  return new Uint8Array(Buffer.concat(chunks));
}

function jpeg(width = 64, height = 32, duplicate = false) {
  const frame = new Uint8Array([255, 192, 0, 17, 8, height >> 8, height & 255, width >> 8, width & 255, 3, 1, 17, 0, 2, 17, 0, 3, 17, 0]);
  return new Uint8Array([255, 216, ...frame, ...(duplicate ? frame : []), 255, 218, 0, 6, 0, 0, 0, 0, 255, 217]);
}

test('source preflight bounds allocation, rejects animation and unknown formats before native decode', () => {
  expect(inspectUploadSource(png())).toEqual({ width: 64, height: 32, mime: 'image/png' });
  expect(inspectUploadSource(jpeg())).toEqual({ width: 64, height: 32, mime: 'image/jpeg' });
  expect(inspectUploadSource(png(2048, 2048)).width).toBe(2048);
  for (const bytes of [png(2049), png(0), png(2, 3, 'acTL'), png(2, 3, 'fcTL'), png(2, 3, 'fdAT'),
    png().slice(0, -1), new Uint8Array([...png(), 1]), jpeg(2049), jpeg(0), jpeg(2, 3, true),
    jpeg().slice(0, 24), new Uint8Array(maxUploadSourceBytes + 1), new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>')]) {
    expect(() => inspectUploadSource(bytes)).toThrow();
  }
  const hostile = png();new DataView(hostile.buffer).setUint32(8, 0xffffffff);
  expect(() => inspectUploadSource(hostile)).toThrow('incomplete');
});
