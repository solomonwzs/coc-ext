/* eslint-disable @typescript-eslint/no-var-requires */
async function start() {
  await require('esbuild').build({
    entryPoints: ['src/coc-ext-common.ts'],
    bundle: true,
    // watch,
    minify: process.env.NODE_ENV === 'production',
    // minify: true,
    sourcemap: process.env.NODE_ENV === 'development',
    mainFields: ['module', 'main'],
    external: ['coc.nvim', 'tiktoken'],
    platform: 'node',
    target: 'node10.12',
    outfile: 'lib/coc-ext-common.js',
  });
}

let watch = false;
if (process.argv.length > 2 && process.argv[2] === '--watch') {
  console.log('watching...');
  watch = {
    onRebuild(error) {
      if (error) {
        console.error('watch build failed:', error);
      } else {
        console.log('watch build succeeded');
      }
    },
  };
}

start(watch).catch((e) => {
  console.error(e);
});
