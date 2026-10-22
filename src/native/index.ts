/**
 * Platform capabilities: each is a lower-case namespace of functions and
 * signals, exported from the root entry.
 */
export { defineModule, event, fn, live, view } from './define-module';

export type {
  AndroidNeeds,
  FunctionDeclarations,
  IosNeeds,
  ModuleEvent,
  ModuleOf,
  NativeNeeds,
  QueuedDeclaration,
  ViewDeclaration,
} from './define-module';

export type { EventSubscription, Json } from './modules';
export type { ReadonlySignal, ScopeOptions } from './scope';
export * as accessibility from './accessibility';
export * as app from './app';
export type { AppState } from './app';
export * as appearance from './appearance';
export type { AppearancePreferences, ColorSchemeName } from './appearance';
export * as backgroundTasks from './background-tasks';
export * as brightness from './brightness';
export * as clipboard from './clipboard';
export * as db from './database';
export type { Comparison, QueryOptions, Table, Where } from './database';
export * as device from './device';
export type { DeviceType } from './device';
export * as fileSystem from './file-system';
export * as fonts from './fonts';
export type { FontSource, FontWeight } from './fonts';
export * as haptics from './haptics';
export type { ImpactStyle, NotificationType } from './haptics';
export * as image from './image';
export type { ImageSize, PrefetchOptions } from './image';
export { keepAwake } from './keep-awake';
export * as keyboard from './keyboard';
export type { KeyboardEventName, KeyboardFrame, KeyboardFrameEvent } from './keyboard';
export * as linking from './linking';
export * as localization from './localization';
export type { Calendar, Locale, MessageCatalogs, MessageValues } from './localization';
export * as network from './network';
export * as notifications from './notifications';
export type { PushToken, ReceivedNotification, ScheduledNotification } from './notifications';
export * as permissions from './permissions';
export { persisted } from './persisted';
export type { PersistedOptions } from './persisted';

export type { PermissionName, PermissionResponse, PermissionStatus } from './permissions';

export type { Schema } from './schema';
export * as secureStore from './secure-store';
export type { KeychainAccessibility, SecureStoreOptions } from './secure-store';
export { share } from './share';
export type { ShareAction, ShareContent, ShareOptions, ShareResult } from './share';
export * as splash from './splash';
export type { SplashFrame, SplashLayout } from './splash';
export * as storage from './storage';
export type { StorageEntry } from './storage';
export * as window from './window';
export type { WidthClass, WindowInsets, WindowOrientation, WindowSize } from './window';

export type {
  NativeViewEvent,
  NativeViewHandle,
  NativeViewMethods,
  NativeViewProps,
  NativeViewSpec,
} from './views';

export { Camera, cameraRef } from './camera';

export type {
  BarcodeEvent,
  BarcodeType,
  CameraErrorEvent,
  CameraFacing,
  CameraFlash,
  CameraHandle,
  CameraMethods,
  CameraMode,
  CameraPicture,
  CameraProps,
  CameraReadyEvent,
  CameraRecording,
  CameraRef,
  PictureOptions,
  RecordingOptions,
} from './camera';

export { Video, videoRef } from './video';

export type {
  VideoBufferEvent,
  VideoEndEvent,
  VideoErrorEvent,
  VideoFullscreenEvent,
  VideoHandle,
  VideoLoadEvent,
  VideoMethods,
  VideoPictureInPictureEvent,
  VideoPlaybackStateEvent,
  VideoProgressEvent,
  VideoProps,
  VideoRef,
  VideoObjectFit,
  VideoSource,
} from './video';

export { Blur } from './blur';
export type { BlurMaterial, BlurProps } from './blur';
export { ContextMenu } from './context-menu';

export {
  Circle,
  Drawing,
  Ellipse,
  Group,
  Line,
  Path,
  Polygon,
  Polyline,
  Rectangle,
} from './drawing';

export type {
  CircleProps,
  DrawingProps,
  DrawingSource,
  EllipseProps,
  FillRule,
  GroupProps,
  LineProps,
  PathProps,
  PolygonProps,
  PolylineProps,
  RectangleProps,
  ShapePaint,
  StrokeLinecap,
  StrokeLinejoin,
} from './drawing';

export type { ContextMenuEvent, ContextMenuItem, ContextMenuProps } from './context-menu';
export { DatePicker } from './date-picker';
export type { DatePickerProps, DatePickerType } from './date-picker';
export { SegmentedControl } from './segmented-control';
export type { SegmentedControlProps } from './segmented-control';
export { Select } from './select';
export type { SelectOption, SelectProps } from './select';
export { Slider } from './slider';
export type { SliderEvent, SliderProps } from './slider';
export { WebView, webViewRef } from './webview';

export type {
  WebViewErrorEvent,
  WebViewHandle,
  WebViewMessageEvent,
  WebViewMethods,
  WebViewNavigation,
  WebViewNavigationEvent,
  WebViewProps,
  WebViewRef,
  WebViewSource,
} from './webview';

export * as location from './location';

export type {
  GeocodedAddress,
  GeocodedLocation,
  LastKnownPositionOptions,
  LocationAccuracy,
  LocationCoords,
  LocationError,
  LocationHeading,
  LocationObject,
  LocationOptions,
  WatchPositionOptions,
} from './location';

export type {
  BackgroundTask,
  BackgroundTaskOptions,
  BackgroundTaskRun,
  BackgroundTaskStatus,
} from './background-tasks';

export * as mediaPicker from './media-picker';

export type {
  CaptureOptions,
  MediaAsset,
  MediaPickerResult,
  MediaType,
  PickOptions,
} from './media-picker';

export type {
  ByteRange,
  DownloadOptions,
  DownloadResult,
  FileInfo,
  FileTransfer,
  TransferProgress,
  UploadOptions,
  UploadResult,
  WriteOptions,
} from './file-system';

export { SplashPart, SplashScreen } from './splash-screen';
export type { SplashPartProps, SplashScreenProps } from './splash-screen';
export { SystemBars } from './system-bars';

export type {
  NavigationBarButtonStyle,
  StatusBarContent,
  StatusBarOptions,
  StatusBarTransition,
  SystemBarsProps,
} from './system-bars-stack';

export { alert } from './alert';
export type { AlertButton, AlertButtonStyle, AlertOptions } from './alert';
export { prompt } from './prompt';
export type { PromptOptions, PromptType, PromptValue } from './prompt';

export { actionSheet } from './action-sheet';
export type { ActionSheetButton, ActionSheetOptions } from './action-sheet';

export * as audio from './audio';

export type {
  AudioInterruption,
  AudioMode,
  AudioPlayer,
  AudioPlayerOptions,
  AudioRecorder,
  AudioRecorderOptions,
  AudioSource,
  Recording,
  RecordingFormat,
  RecordingQuality,
} from './audio';
