import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  SubwayTrainPreview,
  type SubwayTrainPreviewProps,
} from "./subway-train-preview";

const DEFAULT_ARGS: SubwayTrainPreviewProps = {
  cameraPreset: "three-quarter",
  carCount: 3,
  bodyColor: "#3c4348",
  lineColor: "#00a84d",
  lightIntensity: 2.2,
  showWindows: true,
  showDoors: true,
  showRoofEquipment: true,
  showBogies: true,
  wireframe: false,
  showAxes: false,
  showBoundingBox: false,
  auditMode: false,
  orbitEnabled: true,
};

const meta = {
  title: "Model Lab/Train Model",
  component: SubwayTrainPreview,
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
  },
  argTypes: {
    cameraPreset: {
      options: ["front", "side", "top", "three-quarter"],
      control: { type: "select" },
    },
    carCount: {
      control: { type: "range", min: 1, max: 6, step: 1 },
    },
    bodyColor: { control: "color" },
    lineColor: { control: "color" },
    lightIntensity: {
      control: { type: "range", min: 0.3, max: 4, step: 0.1 },
    },
    auditMode: { table: { disable: true } },
    orbitEnabled: { table: { disable: true } },
  },
} satisfies Meta<typeof SubwayTrainPreview>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Interactive: Story = {
  args: DEFAULT_ARGS,
};

export const GeometryAudit: Story = {
  args: {
    ...DEFAULT_ARGS,
    cameraPreset: "three-quarter",
    showAxes: true,
    showBoundingBox: true,
    auditMode: true,
    orbitEnabled: false,
  },
  parameters: {
    controls: { disable: true },
  },
};
