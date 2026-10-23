import { validated } from '../storage-sqlite/validation.ts';
import { LifecycleError } from '../core/lifecycle.ts';
import type { CodexAnswer } from '../../contracts/generated/codex-answer.ts';
import type { CodexQuestionObservation } from '../../contracts/generated/codex-question.ts';

// A validation boundary for a client-supplied answer, not an RPC sender or approval authority.
export function correlateAnswer(input: CodexAnswer, pending: CodexQuestionObservation): CodexAnswer {
  const answer = validated('codex-answer', input), question = validated('codex-question', pending);
  if (question.status !== 'pending' || answer.sessionId !== question.sessionId || answer.turnId !== question.turnId ||
    answer.requestId !== question.requestId || Object.keys(answer.answers).length !== question.questionIds.length ||
    question.questionIds.some(id => !Object.hasOwn(answer.answers, id))) throw new LifecycleError('stale_revision');
  return answer;
}
