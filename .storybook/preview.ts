import type { Preview } from "@storybook/react-vite";

const preview: Preview = {
  parameters: {
    layout: "fullscreen",
    backgrounds: {
      options: {
        controlRoom: { name: "Control room", value: "#08110f" },
      },
    },
  },
  initialGlobals: {
    backgrounds: { value: "controlRoom" },
  },
};

export default preview;
