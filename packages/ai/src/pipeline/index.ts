// API công khai của module pipeline. Thêm export mới ở ĐÂY (không sửa src/index.ts).
export {
  type PipelineDeps,
  type PipelineGate,
  type PipelineInput,
  type PipelineResult,
  type PipelineRiskInputs,
  type PipelineThread,
  runPipeline,
} from './run-pipeline';
