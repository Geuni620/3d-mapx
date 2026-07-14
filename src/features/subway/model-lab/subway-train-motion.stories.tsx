import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  Line2TrainMotionPreview,
  SubwayBuilderReferenceMotionPreview,
  SubwayTrainConceptMotionPreview,
  SyntheticTrainMotionPreview,
} from "./subway-train-preview";
import { LINE_2_TRAIN_SIMULATION_EPOCH_MS } from "../line-2-train-demo-config";

interface TrainMotionStoryArgs {
  progress: number;
  speed: number;
  paused: boolean;
  showGuides: boolean;
  fixedTimestamp: number;
  live: boolean;
}

const MOVING_LINE_2_TIMESTAMP = LINE_2_TRAIN_SIMULATION_EPOCH_MS + 30_000;
const DWELLING_LINE_2_TIMESTAMP = LINE_2_TRAIN_SIMULATION_EPOCH_MS + 10_000;

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
    fixedTimestamp: MOVING_LINE_2_TIMESTAMP,
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

export const SixModelConcepts: Story = {
  args: {
    progress: 0.42,
    speed: 0.7,
    paused: false,
    showGuides: true,
    fixedTimestamp: MOVING_LINE_2_TIMESTAMP,
    live: false,
  },
  parameters: {
    controls: {
      include: ["progress", "speed", "paused", "showGuides"],
    },
  },
  render: ({ progress, speed, paused, showGuides }) => (
    <SubwayTrainConceptMotionPreview
      progress={progress}
      speed={speed}
      paused={paused}
      showGuides={showGuides}
    />
  ),
};

export const SubwayBuilderReference: Story = {
  args: {
    progress: 0.58,
    speed: 0.8,
    paused: false,
    showGuides: true,
    fixedTimestamp: MOVING_LINE_2_TIMESTAMP,
    live: false,
  },
  parameters: {
    controls: {
      include: ["progress", "speed", "paused", "showGuides"],
    },
  },
  render: ({ progress, speed, paused, showGuides }) => (
    <SubwayBuilderReferenceMotionPreview
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
    fixedTimestamp: MOVING_LINE_2_TIMESTAMP,
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

export const Line2Dwelling: Story = {
  args: {
    progress: 0.42,
    speed: 1,
    paused: true,
    showGuides: true,
    fixedTimestamp: DWELLING_LINE_2_TIMESTAMP,
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
    fixedTimestamp: MOVING_LINE_2_TIMESTAMP,
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
