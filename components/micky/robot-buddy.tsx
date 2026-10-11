'use client';
import {memo,useSyncExternalStore} from 'react';
import {RobotHead} from '@/RobotHeads/src';
import type {RobotHeadState} from '@/RobotHeads/src';
import {subscribeRobot,robotSnapshot,robotServerSnapshot} from '@/lib/robot-settings-store';
export function useRobotSettings(){
  return useSyncExternalStore(subscribeRobot,robotSnapshot,robotServerSnapshot);
}
export const RobotBuddy=memo(function RobotBuddy({state='idle',size=120,color}:{state?:RobotHeadState;size?:number;color?:string}){
  const settings=useRobotSettings();return <RobotHead {...settings} paused={size<64||settings.paused} state={state} size={size} color={color??settings.color} antenna={size>=64&&settings.antenna} interactive={size>=64&&settings.interactive} aria-label={'Micky robot, '+state}/>;
});
