import { expect } from 'chai';
import { readFileSync, existsSync } from 'fs';
import { buildThemeCSS } from '../lib/theme-css';

const filePath = 'src/custom.css';
const TIMEOUT = 1000 * 20;

describe('theme-css', () => {
  function expectIncludeCss(css: string): void {
    expect(existsSync(filePath)).eq(true);
    const all = readFileSync(filePath, 'utf-8');
    expect(all.includes(css)).eq(true);
  }

  it(`should be dark theme`, async () => {
    await buildThemeCSS({ list: [{ theme: 'dark', filePath }] });
    expectIncludeCss(`.a{color:#000}`);
  }).timeout(TIMEOUT);

  it(`should be #000 to #fff via modifyVars`, async () => {
    await buildThemeCSS({ list: [{ key: 'custom', modifyVars: { '@primary-color': '#fff' }, filePath }] });
    expectIncludeCss(`.a{color:#fff}`);
  }).timeout(TIMEOUT);

  it(`should be not clean css`, async () => {
    await buildThemeCSS({ min: false, list: [{ key: 'custom', modifyVars: { '@primary-color': '#f60' }, filePath }] });
    expect(existsSync(filePath)).eq(true);
    const all = readFileSync(filePath, 'utf-8');
    // + 1 end of line
    expect(all.split('\n').length).eq(3 + 1);
  }).timeout(TIMEOUT);

  it(`should be throw error 'Not found valid theme configuration'`, async () => {
    try {
      await buildThemeCSS({});
      expect(true).eq(true);
    } catch (ex) {
      expect(ex.message).eq(`Not found valid theme configuration`);
    }
  });
});
