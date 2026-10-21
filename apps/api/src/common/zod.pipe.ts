import { BadRequestException, PipeTransform } from '@nestjs/common';
import type { ZodSchema } from 'zod';

/** Validates a body/query with a shared zod schema; returns field errors in `errors`. */
export class ZodPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodSchema<T>) {}
  transform(value: unknown): T {
    const r = this.schema.safeParse(value ?? {});
    if (r.success) return r.data;
    const errors: Record<string, string[]> = {};
    for (const issue of r.error.issues) {
      const key = issue.path.join('.') || '_';
      (errors[key] ??= []).push(issue.message);
    }
    throw new BadRequestException({ message: 'Please check the highlighted fields', errors });
  }
}
