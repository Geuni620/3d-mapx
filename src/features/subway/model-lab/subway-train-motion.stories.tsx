import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  Line2TrainMotionPreview,
  SyntheticTrainMotionPreview,
} from "./subway-train-preview";

interface TrainMotionStoryArgs {
  progress: number;
  speed: number;
  paused: boolean;
  showGuides: boolean;
  fixedTimestamp: number;
  live: boolean;
}

const FIXED_LINE_2_TIMESTAMP = Date.UTC(2026, 6, 10, 3, 0, 0);

const meta = {
  title: "Model Lab/Train Motion",
  parameters: {
    layout: "fullscreen",
  },
  argTypes: {
    progress: {
      control: { type: "range", min: 0.18, max: 0.82, step: 0.01 },
    },
    speed: {
      control: { type: "range", min: 0.1, max: 3, step: 0.1 },
    },
    fixedTimestamp: {
      control: "date",
    },
    live: {
      control: "boolean",
    },
  },
} satisfies Meta<TrainMotionStoryArgs>;

export default meta;
type Story = StoryObj<TrainMotionStoryArgs>;

export const OppositeDirections: Story = {
  args: {
    progress: 0.42,
    speed: 1,
    paused: false,
    showGuides: true,
    fixedTimestamp: FIXED_LINE_2_TIMESTAMP,
    live: false,
  },
  parameters: {
    controls: {
      include: ["progress", "speed", "paused", "showGuides"],
    },
  },
  render: ({ progress, speed, paused, showGuides }) => (
    <SyntheticTrainMotionPreview
      progress={progress}
      speed={speed}
      paused={paused}
      showGuides={showGuides}
    />
  ),
};

export const Line2FixedTimestamp: Story = {
  args: {
    progress: 0.42,
    speed: 1,
    paused: true,
    showGuides: true,
    fixedTimestamp: FIXED_LINE_2_TIMESTAMP,
    live: false,
  },
  parameters: {
    controls: {
      include: ["fixedTimestamp", "showGuides"],
    },
  },
  render: ({ fixedTimestamp, showGuides }) => (
    <Line2TrainMotionPreview
      fixedTimestamp={fixedTimestamp}
      live={false}
      speed={1}
      paused
      showGuides={showGuides}
    />
  ),
};

export const Line2Live: Story = {
  args: {
    progress: 0.42,
    speed: 1,
    paused: false,
    showGuides: true,
    fixedTimestamp: FIXED_LINE_2_TIMESTAMP,
    live: true,
  },
  parameters: {
    controls: {
      include: ["speed", "paused", "showGuides"],
    },
  },
  render: ({ speed, paused, showGuides, fixedTimestamp }) => (
    <Line2TrainMotionPreview
      fixedTimestamp={fixedTimestamp}
      live
      speed={speed}
      paused={paused}
      showGuides={showGuides}
    />
  ),
};
