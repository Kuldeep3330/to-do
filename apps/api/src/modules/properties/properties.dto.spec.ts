import { createPropertySchema, patchPropertySchema, propertyListQuerySchema } from './properties.dto';

const uuid = '11111111-1111-4111-8111-111111111111';
const uuid2 = '22222222-2222-4222-8222-222222222222';

describe('property DTOs', () => {
  const validCreate = {
    type: 'RESIDENTIAL' as const,
    cityId: uuid,
    localityId: uuid2,
    internalTitle: 'Dwarka 3BHK',
  };

  it('accepts a valid create payload', () => {
    const parsed = createPropertySchema.parse(validCreate);
    expect(parsed.internalTitle).toBe('Dwarka 3BHK');
    expect(parsed.type).toBe('RESIDENTIAL');
  });

  it('rejects missing required fields', () => {
    const result = createPropertySchema.safeParse({ type: 'RESIDENTIAL' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths).toEqual(expect.arrayContaining(['cityId', 'localityId', 'internalTitle']));
    }
  });

  it('rejects lat without lng', () => {
    const result = createPropertySchema.safeParse({ ...validCreate, lat: 28.6 });
    expect(result.success).toBe(false);
  });

  it('rejects pageSize above 24', () => {
    const result = propertyListQuerySchema.safeParse({ page: '1', pageSize: '999' });
    expect(result.success).toBe(false);
  });

  it('defaults page and pageSize', () => {
    const parsed = propertyListQuerySchema.parse({});
    expect(parsed.page).toBe(1);
    expect(parsed.pageSize).toBe(24);
  });

  it('rejects empty patch internalTitle', () => {
    const result = patchPropertySchema.safeParse({ internalTitle: '' });
    expect(result.success).toBe(false);
  });

  it('rejects non-positive areaValue', () => {
    const result = createPropertySchema.safeParse({ ...validCreate, areaValue: 0 });
    expect(result.success).toBe(false);
  });
});
