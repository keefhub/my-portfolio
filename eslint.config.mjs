import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

// eslint-config-next 16 ships native flat config, so it is spread directly.
// Wrapping it in FlatCompat (the Next 15 pattern) throws "Converting circular
// structure to JSON" during config validation.
const eslintConfig = [
  { ignores: [".next/**", "out/**", "node_modules/**"] },
  ...nextCoreWebVitals,
];

export default eslintConfig;
