// API công khai của module examples. Thêm export mới ở ĐÂY (không sửa src/index.ts).
export {
  type CaptureInput,
  type CaptureResult,
  captureAnswerExample,
  EXAMPLE_CAP,
  EXAMPLE_PICK_LIMIT,
  type ExamplesDeps,
  type PickQuery,
  pickVoiceExamples,
  setExampleStatus,
  type VoiceExample,
} from './answer-examples';
export {
  type AnswerExample,
  createInMemoryExampleStore,
  type ExampleStatus,
  type ExampleStore,
} from './example-store';
export {
  type BuildTemplateResult,
  buildExampleTemplate,
  EXAMPLE_REJECT,
  type ExampleRejectCode,
  type ExampleVariant,
  fillExampleTemplate,
} from './example-template';
