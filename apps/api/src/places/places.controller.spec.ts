import { BadRequestException } from '@nestjs/common';
import { PlacesController } from './places.controller';

describe('PlacesController.nearby', () => {
  const makeCtrl = () => {
    const svc: any = { nearby: jest.fn().mockResolvedValue([]) };
    return { svc, ctrl: new PlacesController(svc) };
  };

  it('缺失 lat/lng → BadRequestException，不调用 service', () => {
    const { svc, ctrl } = makeCtrl();
    expect(() => ctrl.nearby(undefined as any, undefined as any)).toThrow(BadRequestException);
    expect(svc.nearby).not.toHaveBeenCalled();
  });

  it('lat/lng 非数字 → BadRequestException', () => {
    const { ctrl } = makeCtrl();
    expect(() => ctrl.nearby('abc', '116.3')).toThrow(BadRequestException);
  });

  it('合法 lat/lng → 调用 service，radius 默认 5000', () => {
    const { svc, ctrl } = makeCtrl();
    ctrl.nearby('39.9', '116.3');
    expect(svc.nearby).toHaveBeenCalledWith(39.9, 116.3, 5000);
  });

  it('自定义 radius', () => {
    const { svc, ctrl } = makeCtrl();
    ctrl.nearby('39.9', '116.3', '2000');
    expect(svc.nearby).toHaveBeenCalledWith(39.9, 116.3, 2000);
  });
});
