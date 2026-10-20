module.exports = {
  root: true,
  extends: '@react-native',
  overrides: [
    {
      // Node-side harnesses: they use fetch/Request/Response, which are Node 18+
      // globals that the React Native config does not declare.
      files: ['scripts/**/*.js'],
      env: {node: true, es2022: true},
      globals: {
        fetch: 'readonly',
        Request: 'readonly',
        Response: 'readonly',
        AbortController: 'readonly',
        AbortSignal: 'readonly',
      },
    },
    {
      // Cloudflare Worker source: ES module in a package with "type": "module".
      files: ['server/**/src/**/*.js'],
      parserOptions: {sourceType: 'module', ecmaVersion: 2022},
      env: {es2022: true},
      globals: {
        fetch: 'readonly',
        Request: 'readonly',
        Response: 'readonly',
        URL: 'readonly',
        AbortController: 'readonly',
        crypto: 'readonly',
      },
    },
    {
      // Local dev tooling around the Worker (Node HTTP servers, not deployed to
      // Cloudflare), so Node globals are legitimate here.
      files: ['server/**/dev-server.js', 'server/**/mock-*.js'],
      parserOptions: {sourceType: 'module', ecmaVersion: 2022},
      env: {node: true, es2022: true},
      globals: {
        fetch: 'readonly',
        Request: 'readonly',
        Response: 'readonly',
      },
    },
  ],
};
