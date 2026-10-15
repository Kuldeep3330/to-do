import { patchMediaSchema } from './media.dto';

describe('patchMediaSchema', () => {
  it('accepts a non-negative sortOrder', () => {
    expect(patchMediaSchema.parse({ sortOrder: 0 })).toEqual({ sortOrder: 0 });
    expect(patchMediaSchema.parse({ sortOrder: 3 }).sortOrder).toBe(3);
  });

  it('rejects missing or negative sortOrder', () => {
    expect(patchMediaSchema.safeParse({}).success).toBe(false);
    expect(patchMediaSchema.safeParse({ sortOrder: -1 }).success).toBe(false);
    expect(patchMediaSchema.safeParse({ sortOrder: 1.5 }).success).toBe(false);
  });
});
