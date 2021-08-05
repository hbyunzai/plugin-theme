import { expect } from 'chai';
import { existsSync } from 'fs';
import { genColorLess } from '../lib/color-less';

const themeFilePath = './src/theme.less';
const outputFilePath = 'src/color.less';
const TIMEOUT = 1000 * 20;

describe('color-less', () => {
  it('should be working', async () => {
    await genColorLess({ outputFilePath, themeFilePath });
    expect(existsSync(outputFilePath)).eq(true);
  }).timeout(TIMEOUT);
});
