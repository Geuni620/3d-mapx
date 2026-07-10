import type { Preview } from "@storybook/react-vite";
import "../src/features/subway/model-lab/subway-train-model-lab.css";

const preview: Preview = {
  parameters: {
    layout: "fullscreen",
    controls: {
      expanded: true,
      matchers: {
        color: /(background|color)$/i,
        date: /Timestamp$/,
      },
    },
    options: {
      storySort: {
        order: ["Model Lab", ["Train Model", "Train Motion"]],
      },
    },
  },
};

export default preview;
