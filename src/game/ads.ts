// admob-v1: AdMob (banner + interstitial). Browser mein kuch nahi karta, sirf Android app mein chalta hai.
//  - Default build = Google ke TEST ads (apne real ads par click karna account ban kara sakta hai).
//  - Play Store release build:  VITE_ADS_REAL=1 npm run build   (tab real ad unit IDs use hote hain).
//  - Under-13 ("child") players ko koi ad nahi dikhta. Teen ko Teen-rated ads, EEA mein UMP consent form.
import { Capacitor } from "@capacitor/core";
import {
  AdMob,
  AdmobConsentStatus,
  BannerAdPosition,
  BannerAdSize,
  InterstitialAdPluginEvents,
  MaxAdContentRating,
  RewardAdPluginEvents,
} from "@capacitor-community/admob";
import type { AgeGroup } from "./save";

const REAL = import.meta.env.VITE_ADS_REAL === "1";
const TESTING = !REAL;

const REAL_IDS = {
  banner: "ca-app-pub-8397637614188934/2465396019",
  interstitial: "ca-app-pub-8397637614188934/4626982932",
  // Rewarded ad unit (AdMob: SpaceBound Rewarded). Khali karoge to real build mein Watch-ad button chhup jayega.
  rewarded: "ca-app-pub-8397637614188934/7608369497",
};
// Google ke official sample ad units (Android).
const TEST_IDS = {
  banner: "ca-app-pub-3940256099942544/9214589741",
  interstitial: "ca-app-pub-3940256099942544/1033173712",
  rewarded: "ca-app-pub-3940256099942544/5224354917",
};
const IDS = REAL ? REAL_IDS : TEST_IDS;

/** Do interstitials ke beech kam az kam itna gap, aur har doosri mission ke baad hi. */
const INTERSTITIAL_GAP_MS = 3 * 60 * 1000;

let group: AgeGroup | null = null;
let initP: Promise<void> | null = null;
let inited = false;
let bannerOn = false;
let interReady = false;
let interLoading = false;
let lastInter = 0;
let missionEnds = 0;
let rewardReady = false;
let rewardLoading = false;

function native(): boolean {
  return Capacitor.isNativePlatform();
}

function allowed(): boolean {
  return native() && group !== null && group !== "child";
}

async function prepareInterstitial(): Promise<void> {
  if (!inited || !allowed() || interReady || interLoading) return;
  interLoading = true;
  try {
    await AdMob.prepareInterstitial({ adId: IDS.interstitial, isTesting: TESTING, immersiveMode: true });
    interReady = true;
  } catch {
    interReady = false;
  } finally {
    interLoading = false;
  }
}

async function prepareRewarded(): Promise<void> {
  if (!inited || !allowed() || !IDS.rewarded || rewardReady || rewardLoading) return;
  rewardLoading = true;
  try {
    await AdMob.prepareRewardVideoAd({ adId: IDS.rewarded, isTesting: TESTING, immersiveMode: true });
    rewardReady = true;
  } catch {
    rewardReady = false;
  } finally {
    rewardLoading = false;
  }
}

export function initAds(ageGroup: AgeGroup | null): Promise<void> {
  group = ageGroup;
  if (!allowed()) return Promise.resolve();
  if (initP) return initP;
  initP = (async () => {
    try {
      const teen = group === "teen";
      let info = await AdMob.requestConsentInfo({ tagForUnderAgeOfConsent: teen });
      if (info.status === AdmobConsentStatus.REQUIRED && info.isConsentFormAvailable) {
        info = await AdMob.showConsentForm();
      }
      if (!info.canRequestAds) return;
      await AdMob.initialize({
        initializeForTesting: TESTING,
        tagForChildDirectedTreatment: false,
        tagForUnderAgeOfConsent: teen,
        ...(teen ? { maxAdContentRating: MaxAdContentRating.Teen } : {}),
      });
      await AdMob.addListener(InterstitialAdPluginEvents.Dismissed, () => {
        interReady = false;
        void prepareInterstitial();
      });
      await AdMob.addListener(InterstitialAdPluginEvents.FailedToShow, () => {
        interReady = false;
      });
      inited = true;
      void prepareInterstitial();
      void prepareRewarded();
    } catch {
      inited = false;
      initP = null; // agli baar dobara koshish
    }
  })();
  return initP;
}

/** Banner sirf main menu par (flight / HUD ke upar kabhi nahi). */
export async function setBanner(show: boolean): Promise<void> {
  if (!allowed()) return;
  if (initP) await initP;
  if (!inited) return;
  if (show && !bannerOn) {
    bannerOn = true;
    try {
      await AdMob.showBanner({
        adId: IDS.banner,
        adSize: BannerAdSize.ADAPTIVE_BANNER,
        position: BannerAdPosition.BOTTOM_CENTER,
        margin: 0,
        isTesting: TESTING,
        immersiveMode: true,
      });
    } catch {
      bannerOn = false;
    }
  } else if (!show && bannerOn) {
    bannerOn = false;
    try {
      await AdMob.removeBanner();
    } catch {
      /* ignore */
    }
  }
}

/** Mission result card ka button dabane par bulao: har 2nd mission ke baad, 3 min gap ke saath. */
export function onMissionEnd(): void {
  missionEnds++;
  if (!inited || !allowed()) return;
  if (missionEnds % 2 !== 0) return;
  if (Date.now() - lastInter < INTERSTITIAL_GAP_MS) return;
  if (!interReady) {
    void prepareInterstitial();
    return;
  }
  interReady = false;
  lastInter = Date.now();
  AdMob.showInterstitial().catch(() => {
    /* ignore */
  });
}

/** Rewarded ad ka button dikhana hai ya nahi (native app, 13+, ads init ho chuke, rewarded unit ID maujood). */
export function canOfferRewarded(): boolean {
  return allowed() && inited && IDS.rewarded !== "";
}

export type RewardedOutcome = "earned" | "closed" | "unavailable";

/** Rewarded video dikhao. "earned" sirf tab jab player ne ad poora dekha. */
export async function showRewarded(): Promise<RewardedOutcome> {
  if (!canOfferRewarded()) return "unavailable";
  if (!rewardReady) {
    void prepareRewarded();
    return "unavailable";
  }
  rewardReady = false;
  let earned = false;
  const handles: { remove: () => Promise<void> }[] = [];
  let finish: () => void = () => {};
  const done = new Promise<void>((resolve) => {
    finish = () => resolve();
  });
  try {
    handles.push(await AdMob.addListener(RewardAdPluginEvents.Rewarded, () => (earned = true)));
    handles.push(await AdMob.addListener(RewardAdPluginEvents.Dismissed, () => finish()));
    handles.push(await AdMob.addListener(RewardAdPluginEvents.FailedToShow, () => finish()));
    const item = await AdMob.showRewardVideoAd();
    if (item) earned = true;
    await done;
  } catch {
    /* ad nahi chala */
  } finally {
    for (const h of handles) void h.remove();
    void prepareRewarded();
  }
  if (earned) lastInter = Date.now(); // reward ke turant baad interstitial nahi
  return earned ? "earned" : "closed";
}
