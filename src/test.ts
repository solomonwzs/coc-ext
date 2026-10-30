// import { computePowAnswerTest2 } from './test/deepseek_test';
// import { puppeteerTest } from './test/browser_test';
// import { pathTest2 } from './test/file_test';
import { contentTextWidthTest } from './test/text_test';
import { mimoTest } from './test/mimo_test';
import { deepseekTest } from './test/deepseek_test';

async function main() {
  console.log('========');
  contentTextWidthTest();
  await mimoTest();
  await deepseekTest();
}

main();
