#import "KuitoJSThread.h"
#include <atomic>

@implementation KuitoJSThread {
  NSThread *_thread;
  CFRunLoopRef _runLoop;
  dispatch_semaphore_t _ready;
  std::atomic_bool _stopped;
}

- (instancetype)initWithName:(NSString *)name {
  self = [super init];
  if (!self) return nil;
  _stopped.store(false);
  _ready = dispatch_semaphore_create(0);
  _thread = [[NSThread alloc] initWithTarget:self selector:@selector(run) object:nil];
  _thread.name = name;
  _thread.qualityOfService = NSQualityOfServiceUserInteractive;
  // Pool threads have 512 KB; deep JavaScript recursion, and the debugger
  // pausing inside it, want more.
  _thread.stackSize = 8 * 1024 * 1024;
  [_thread start];
  dispatch_semaphore_wait(_ready, DISPATCH_TIME_FOREVER);
  return self;
}

- (void)run {
  @autoreleasepool {
    _runLoop = (CFRunLoopRef)CFRetain(CFRunLoopGetCurrent());
    // A run loop without a source returns at once.
    [NSRunLoop.currentRunLoop addPort:[NSMachPort port] forMode:NSDefaultRunLoopMode];
    dispatch_semaphore_signal(_ready);
  }
  while (!_stopped) {
    @autoreleasepool {
      [NSRunLoop.currentRunLoop runMode:NSDefaultRunLoopMode beforeDate:NSDate.distantFuture];
    }
  }
}

// The run loop outlives its thread until here: `async:` can read `_stopped`
// as false just before the thread ends, then queue onto the run loop.
- (void)dealloc {
  CFRelease(_runLoop);
}

- (void)async:(dispatch_block_t)block {
  if (_stopped) return;
  CFRunLoopPerformBlock(_runLoop, kCFRunLoopDefaultMode, ^{
    if (self->_stopped) return;
    @autoreleasepool { block(); }
  });
  CFRunLoopWakeUp(_runLoop);
}

- (void)after:(NSTimeInterval)seconds async:(dispatch_block_t)block {
  dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(seconds * NSEC_PER_SEC)),
                 dispatch_get_global_queue(QOS_CLASS_USER_INTERACTIVE, 0), ^{
    [self async:block];
  });
}

- (void)stop {
  [self async:^{
    self->_stopped.store(true);
    CFRunLoopStop(self->_runLoop);
  }];
}

@end
