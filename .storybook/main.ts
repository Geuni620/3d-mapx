import type { StorybookConfig } from "@storybook/react-vite";

const config: StorybookConfig = {
  stories: ["../src/**/*.stories.@(js|jsx|mjs|ts|tsx)"],
  staticDirs: [{ from: "../public/rolling-stock", to: "/rolling-stock" }],
  framework: {
    name: "@storybook/react-vite",
    options: {},
  },
};

export default config;
