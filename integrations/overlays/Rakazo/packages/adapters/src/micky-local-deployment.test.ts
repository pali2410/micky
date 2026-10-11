import { describe, expect, it } from 'vitest';
import { resolveDeploymentModel } from './deployment-model.js';
describe('Micky local deployment',()=>{
  const env={PI_DEFAULT_PROVIDER:'local',PI_DEFAULT_MODEL:'fixture:3b',RAKAZO_LOCAL_MODELS:'fixture:3b,other:3b',RAKAZO_LOCAL_MODELS_URL:'http://127.0.0.1:11434/v1'};
  it('uses a keyless configured local model',()=>{expect(resolveDeploymentModel(env)).toMatchObject({provider:'local',model:'fixture:3b',key:'local',configured:true});});
  it('rejects an unknown model or hosted endpoint',()=>{expect(resolveDeploymentModel({...env,PI_DEFAULT_MODEL:'missing'}).configured).toBe(false);expect(resolveDeploymentModel({...env,RAKAZO_LOCAL_MODELS_URL:'https://remote.example/v1'}).configured).toBe(false);});
});
