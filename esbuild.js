const esbuild = require('esbuild');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/**
 * @type {import('esbuild').Plugin}
 */
const esbuildProblemMatcherPlugin = {
  name: 'esbuild-problem-matcher',

  setup(build) {
    build.onStart(() => {
      console.log('[watch] build started');
    });
    build.onEnd((result) => {
      result.errors.forEach(({ text, location }) => {
        console.error(`✘ [ERROR] ${text}`);
        console.error(`    ${location.file}:${location.line}:${location.column}:`);
      });
      console.log('[watch] build finished');
    });
  },
};

/** バンドルの一覧。拡張機能ホスト（node）と Webview（browser）で分ける */
const builds = [
  {
    entryPoints: ['src/extension.ts'],
    platform: 'node',
    format: 'cjs',
    outfile: 'dist/extension.js',
    external: ['vscode'],
  },
  {
    // 索引の作成と検索を、拡張機能ホストの主スレッドの外で行う
    entryPoints: ['src/worker/worker.ts'],
    platform: 'node',
    format: 'cjs',
    outfile: 'dist/worker.js',
  },
  {
    entryPoints: ['src/webview/main.ts'],
    platform: 'browser',
    format: 'iife',
    outfile: 'dist/webview.js',
  },
  {
    entryPoints: ['src/webview/styles.css'],
    outfile: 'dist/webview.css',
  },
];

async function main() {
  const contexts = await Promise.all(
    builds.map((options) =>
      esbuild.context({
        ...options,
        bundle: true,
        minify: production,
        sourcemap: !production,
        sourcesContent: false,
        logLevel: 'silent',
        plugins: [
          /* add to the end of plugins array */
          esbuildProblemMatcherPlugin,
        ],
      })
    )
  );
  if (watch) {
    await Promise.all(contexts.map((ctx) => ctx.watch()));
  } else {
    await Promise.all(contexts.map((ctx) => ctx.rebuild()));
    await Promise.all(contexts.map((ctx) => ctx.dispose()));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
