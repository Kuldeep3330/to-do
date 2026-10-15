import '../load-env';
import { PrismaService } from './prisma.service';

describe('PrismaService lifecycle', () => {
  it('disconnects on module destroy', async () => {
    const prisma = new PrismaService();
    const disconnect = jest.spyOn(prisma, '$disconnect').mockResolvedValue();
    await prisma.onModuleDestroy();
    expect(disconnect).toHaveBeenCalledTimes(1);
    disconnect.mockRestore();
  });
});
