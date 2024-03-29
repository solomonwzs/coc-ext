/* eslint-disable @typescript-eslint/no-var-requires */
async function start() {
  await require('esbuild').build({
    entryPoints: ['src/test.ts'],
    bundle: true,
    // watch,
    // minify: process.env.NODE_ENV === 'production',
    minify: false,
    sourcemap: process.env.NODE_ENV === 'development',
    mainFields: ['module', 'main'],
    external: [],
    platform: 'node',
    target: 'node10.12',
    outfile: 'lib/test.js',
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
