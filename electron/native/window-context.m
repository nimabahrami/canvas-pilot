#import <AppKit/AppKit.h>
#import <CoreGraphics/CoreGraphics.h>

int main(int argc, const char *argv[]) {
  @autoreleasepool {
    pid_t frontmost = NSWorkspace.sharedWorkspace.frontmostApplication.processIdentifier;
    CGWindowID requested = argc > 1 ? (CGWindowID)strtoul(argv[1], NULL, 10) : kCGNullWindowID;
    CGWindowListOption options = requested ? kCGWindowListOptionIncludingWindow : (kCGWindowListOptionOnScreenOnly | kCGWindowListExcludeDesktopElements);
    NSArray *windows = CFBridgingRelease(CGWindowListCopyWindowInfo(options, requested));
    NSMutableArray *result = [NSMutableArray array];
    for (NSDictionary *window in windows) {
      if (!requested && ([window[(id)kCGWindowOwnerPID] intValue] != frontmost || [window[(id)kCGWindowLayer] intValue] != 0)) continue;
      NSDictionary *bounds = window[(id)kCGWindowBounds];
      if ([bounds[@"Width"] doubleValue] < 2 || [bounds[@"Height"] doubleValue] < 2) continue;
      [result addObject:@{@"id": [NSString stringWithFormat:@"window:%@:0", window[(id)kCGWindowNumber]],
                 @"bounds": @{@"x": bounds[@"X"], @"y": bounds[@"Y"], @"width": bounds[@"Width"], @"height": bounds[@"Height"]}}];
    }
    NSData *json = [NSJSONSerialization dataWithJSONObject:result options:0 error:nil];
    fwrite(json.bytes, 1, json.length, stdout);
  }
  return 0;
}
