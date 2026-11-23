
import { translate } from "@/i18n";
type CoreModel = {
    drawables: { count: number; renderOrders?: Int32Array };
    offscreens?: { count: number };
    getRenderOrders?: () => Int32Array;
};

// Cubism 5.3 moved render orders to Model and added offscreen render objects.
// Adapt only drawable-only models: the Cubism 4 renderer cannot draw offscreens.
export function adaptLive2DRenderOrders(model: { getModel: () => CoreModel; getDrawableRenderOrders: () => Int32Array }) {
    const core = model.getModel();
    if (core.offscreens?.count) throw new Error(translate("shared.canvas.live2dCoreAdapter.thisModelUsesNewerOffscreenRenderingThatTheCurrentLive2D"));
    if (core.drawables.renderOrders) return;
    if (!core.getRenderOrders) throw new Error(translate("shared.canvas.live2dCoreAdapter.live2DCoreIsMissingTheDrawOrderInterfaceCheckThe"));
    const getOrders = () => {
        const orders = core.getRenderOrders!();
        if (orders.length !== core.drawables.count) throw new Error(translate("shared.canvas.live2dCoreAdapter.live2DModelDrawOrderCountMismatch"));
        return orders;
    };
    getOrders();
    model.getDrawableRenderOrders = getOrders;
}
