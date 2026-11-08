import pkg from "./package.json" with { type: "json" };

globalThis.__OPENFPGA_TOOLKIT_ACTION_VERSION__ = pkg.version;
globalThis.__OPENFPGA_TOOLKIT_ACTION_TEST_ENV__ = "unit-test";
