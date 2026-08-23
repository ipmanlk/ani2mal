import { describe, expect, it } from '../helpers/testkit.ts'
import {
  ApiError,
  AuthError,
  CancelledError,
  CliError,
  ConfigError,
  NetworkError,
  TimeoutReachedError,
  toExitCode,
} from '@/lib/errors.ts'

describe('toExitCode', () => {
  it('maps correctly', () => {
    expect(toExitCode(new CliError('x'))).toBe(2)
    expect(toExitCode(new ConfigError('x'))).toBe(2)
    expect(toExitCode(new AuthError('x'))).toBe(2)
    expect(toExitCode(new ApiError('x'))).toBe(3)
    expect(toExitCode(new NetworkError('x'))).toBe(3)
    expect(toExitCode(new TimeoutReachedError('x'))).toBe(3)
    expect(toExitCode(new CancelledError())).toBe(0)
    expect(toExitCode(new Error('unknown'))).toBe(3)
  })
})
