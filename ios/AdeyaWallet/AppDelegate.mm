#import "AppDelegate.h"

#import <React/RCTBundleURLProvider.h>
#import <React/RCTLinkingManager.h>
#import <ReactAppDependencyProvider/RCTAppDependencyProvider.h>

#import <Firebase.h>

@interface SceneDelegate : UIResponder <UIWindowSceneDelegate>
@property (nonatomic, strong) UIWindow *window;
@end

@implementation AppDelegate

- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)launchOptions
{
  [FIRApp configure];


  self.dependencyProvider = [RCTAppDependencyProvider new];
  self.moduleName = @"CREDEBLWallet";
  // You can add your custom initial props in the dictionary below.
  // They will be passed down to the ViewController used by React Native.
  self.initialProps = @{};

  // UIScene lifecycle: the React Native window is created per-scene in SceneDelegate.
  self.automaticallyLoadReactNativeWindow = NO;

  return [super application:application didFinishLaunchingWithOptions:launchOptions];
}

- (UISceneConfiguration *)application:(UIApplication *)application
    configurationForConnectingSceneSession:(UISceneSession *)connectingSceneSession
                                   options:(UISceneConnectionOptions *)options
{
  UISceneConfiguration *config = [[UISceneConfiguration alloc] initWithName:@"Default Configuration"
                                                                sessionRole:connectingSceneSession.role];
  config.delegateClass = [SceneDelegate class];
  return config;
}

- (NSURL *)sourceURLForBridge:(RCTBridge *)bridge
{
  return [self bundleURL];
}

- (NSURL *)bundleURL
{
#if DEBUG
  return [[RCTBundleURLProvider sharedSettings] jsBundleURLForBundleRoot:@"index"];
#else
  return [[NSBundle mainBundle] URLForResource:@"main" withExtension:@"jsbundle"];
#endif
}
- (BOOL)application:(UIApplication *)application
  openURL:(NSURL *)url
  options:(NSDictionary<UIApplicationOpenURLOptionsKey,id> *)options
{
 return [RCTLinkingManager application:application openURL:url options:options];
}

- (BOOL)application:(UIApplication *)application continueUserActivity:(nonnull NSUserActivity *)userActivity
 restorationHandler:(nonnull void (^)(NSArray<id<UIUserActivityRestoring>> * _Nullable))restorationHandler
{
 return [RCTLinkingManager application:application
                  continueUserActivity:userActivity
                    restorationHandler:restorationHandler];
}
@end

@implementation SceneDelegate

- (void)scene:(UIScene *)scene willConnectToSession:(UISceneSession *)session options:(UISceneConnectionOptions *)connectionOptions
{
  if (![scene isKindOfClass:[UIWindowScene class]]) {
    return;
  }
  AppDelegate *appDelegate = (AppDelegate *)[UIApplication sharedApplication].delegate;
  self.window = [[UIWindow alloc] initWithWindowScene:(UIWindowScene *)scene];
  appDelegate.window = self.window;

  [appDelegate.reactNativeFactory startReactNativeWithModuleName:appDelegate.moduleName
                                                        inWindow:self.window
                                               initialProperties:appDelegate.initialProps
                                                   launchOptions:nil];

  // Deliver links / user activities that cold-launched the app.
  for (UIOpenURLContext *context in connectionOptions.URLContexts) {
    [RCTLinkingManager application:[UIApplication sharedApplication] openURL:context.URL options:@{}];
  }
  for (NSUserActivity *activity in connectionOptions.userActivities) {
    [RCTLinkingManager application:[UIApplication sharedApplication] continueUserActivity:activity restorationHandler:^(NSArray<id<UIUserActivityRestoring>> *_Nullable r) {}];
  }
}

- (void)scene:(UIScene *)scene openURLContexts:(NSSet<UIOpenURLContext *> *)URLContexts
{
  for (UIOpenURLContext *context in URLContexts) {
    [RCTLinkingManager application:[UIApplication sharedApplication] openURL:context.URL options:@{}];
  }
}

- (void)scene:(UIScene *)scene continueUserActivity:(NSUserActivity *)userActivity
{
  [RCTLinkingManager application:[UIApplication sharedApplication]
            continueUserActivity:userActivity
              restorationHandler:^(NSArray<id<UIUserActivityRestoring>> *_Nullable r) {}];
}

@end
