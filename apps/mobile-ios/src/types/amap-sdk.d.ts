declare module "@spatacus/react-native-amap-sdk" {
  import * as React from "react";

  export type AMapCoordinate = {
    latitude: number;
    longitude: number;
  };

  export const Marker: React.ComponentType<any>;
  export const Polygon: React.ComponentType<any>;
  export const Circle: React.ComponentType<any>;

  export class MapView extends React.Component<any> {
    static Marker: React.ComponentType<any>;
    static Polygon: React.ComponentType<any>;
    static Circle: React.ComponentType<any>;
    animateTo(target: {
      zoomLevel?: number;
      coordinate?: AMapCoordinate;
      tilt?: number;
      rotation?: number;
    }, duration?: number): void;
  }

  const DefaultMapView: typeof MapView;
  export default DefaultMapView;
}
