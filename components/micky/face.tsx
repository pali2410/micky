"use client";
import {RobotBuddy} from "./robot-buddy";
export type FaceState="idle"|"listening"|"thinking"|"speaking"|"happy"|"working";
export function MickyFace({state="idle",size=120,color,botId}:{state?:FaceState;size?:number;color?:string;botId?:string;force2D?:boolean}){return <RobotBuddy state={state} size={size} color={botId&&botId!=="micky"?color:undefined}/>;}
