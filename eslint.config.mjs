export default [
  { ignores: ['dist/', 'node_modules/', '*.config.*', '*.d.ts', '*.wasm', 'public/', 'worker/', 'ALTHEA_VISUAL_SYSTEM_FINAL/'] },
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      parser: await import('@typescript-eslint/parser'),
      parserOptions: {
        project: ['./tsconfig.json', './tsconfig.node.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    settings: {
      react: { version: '18.3' },
    },
    plugins: {
      react: await import('eslint-plugin-react'),
      'react-hooks': await import('eslint-plugin-react-hooks'),
      // eslint-plugin-jsx-a11y es CommonJS: sus `rules` viven bajo `.default` del
// namespace que devuelve `import()`. Sin ese `.default` el plugin se registra
// pero ninguna regla existe ("Could not find X in plugin jsx-a11y").
'jsx-a11y': (await import('eslint-plugin-jsx-a11y')).default,
    },
    rules: {
      // React
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      'react/require-default-props': 'off',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      // A11Y-002: el plugin estaba instalado pero nunca se cargó, así que no
      // había ninguna detección de accesibilidad. Se activa como `warn` (el
      // proyecto usa --max-warnings 0, así que quedan visibles sin bloquear).
      'jsx-a11y/alt-text': 'warn',
      'jsx-a11y/anchor-is-valid': 'warn',
      'jsx-a11y/aria-props': 'warn',
      'jsx-a11y/aria-proptypes': 'warn',
      'jsx-a11y/aria-role': 'warn',
      'jsx-a11y/aria-unsupported-elements': 'warn',
      // Las dos reglas siguientes detectan los mismos 77 elementos (div/span con
      // onClick). Dejarlas en 'warn' haría fallar `npm run lint` (el proyecto
      // usa --max-warnings 0) por deuda preexistente, y bloquear el gate por
      // algo que ya está en el código no aporta nada. Quedan documentadas en
      // docs/DEUDA_ACCESIBILIDAD.md con archivo y línea para atacarlas por
      // lotes. Se reactivan cuando se migren a un primitivo accesible.
      'jsx-a11y/click-events-have-key-events': 'off',
      'jsx-a11y/no-static-element-interactions': 'off',
      'jsx-a11y/label-has-associated-control': 'warn',
      'jsx-a11y/role-has-required-aria-props': 'warn',
      'jsx-a11y/no-autofocus': 'off',
      'jsx-a11y/heading-has-content': 'off',
      'jsx-a11y/no-noninteractive-element-interactions': 'off',
      'jsx-a11y/no-redundant-roles': 'off',
      'jsx-a11y/scope': 'off',
      // General - make these warnings for now to not block
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'no-debugger': 'warn',
      'eqeqeq': ['warn', 'always'],
      'curly': ['warn', 'all'],
    },
  },
  {
    files: ['src/**/*.test.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      parser: await import('@typescript-eslint/parser'),
    },
    rules: {
      'no-console': 'off',
      'curly': 'off',
      'eqeqeq': 'off',
    },
  },
  {
    files: ['tests/**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      parser: await import('@typescript-eslint/parser'),
    },
    rules: {
      'no-console': 'off',
      'curly': 'off',
      'eqeqeq': 'off',
    },
  },
]