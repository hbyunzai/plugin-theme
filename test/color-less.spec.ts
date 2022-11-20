import { expect } from 'chai';
import { existsSync, readFileSync } from 'fs';
import { genColorLess } from '../lib/color-less';

const themeFilePath = './src/theme.less';
const outputFilePath = 'src/color.less';
const TIMEOUT = 1000 * 20;

describe('color-less', () => {
  it('should be working', async () => {
    await genColorLess({
      outputFilePath,
      themeFilePath,
      styleFilePath: './src/theme-entry.less',
      variables: ['@primary-color', '@bg', '@sv-label-color'],
    });
    expect(existsSync(outputFilePath)).eq(true);
    const content = readFileSync(outputFilePath).toString('utf8');
    expect(content).contain('color: @primary-color;');
    expect(content).not.contain('font-size: 1px;');
    expect(content).not.contain('margin: 1000px;');
  }).timeout(TIMEOUT);
});
