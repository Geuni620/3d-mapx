import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  SubwayTrainHeadingComparison,
  SubwayTrainHeadingSimulationComparison,
} from "./subway-train-heading-comparison";

const meta = {
  title: "Subway/Train heading comparison",
  component: SubwayTrainHeadingComparison,
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof SubwayTrainHeadingComparison>;

export default meta;
type Story = StoryObj<typeof meta>;

export const BeforeAndAfter: Story = {};

export const ContinuousSimulation: Story = {
  render: () => <SubwayTrainHeadingSimulationComparison />,
};
