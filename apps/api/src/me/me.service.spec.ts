import { MeService } from './me.service';

describe('MeService.myPools', () => {
  it('返回本人 ACTIVE 登记的泳池 {id,name}', async () => {
    const prisma: any = {
      registration: {
        findMany: jest.fn().mockResolvedValue([
          { pool: { id: 'p1', name: 'A' } },
          { pool: { id: 'p2', name: 'B' } },
        ]),
      },
    };
    const svc = new MeService(prisma);
    const res = await svc.myPools('s1');
    expect(prisma.registration.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { swimmerId: 's1', status: 'ACTIVE' } }),
    );
    expect(res).toEqual([
      { id: 'p1', name: 'A' },
      { id: 'p2', name: 'B' },
    ]);
  });
});
