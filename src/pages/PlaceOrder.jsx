// src/pages/PlaceOrder.jsx
import React, { useContext, useState, useEffect } from "react";
import { ShopContext } from "../context/ShopContext";
import { motion } from "framer-motion";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import PhoneInput from "react-phone-input-2";

const PAK_PROVINCES = [
  "Punjab",
  "Sindh",
  "Khyber Pakhtunkhwa",
  "Balochistan",
  "Islamabad Capital Territory",
  "Gilgit-Baltistan",
  "Azad Jammu & Kashmir",
];

const PLACEHOLDER_IMG =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'>
       <rect width='100%' height='100%' fill='#f3f4f6'/>
       <text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle'
         fill='#9ca3af' font-family='Arial' font-size='14'>Product</text>
     </svg>`
  );

const urlFromAny = (val) => {
  if (!val) return null;
  if (typeof val === "string") return val;
  if (Array.isArray(val)) {
    for (const it of val) {
      const u = urlFromAny(it);
      if (u) return u;
    }
    return null;
  }
  if (typeof val === "object") {
    return (
      urlFromAny(val.secure_url) ||
      urlFromAny(val.url) ||
      urlFromAny(val.src) ||
      urlFromAny(val.path) ||
      urlFromAny(val.image) ||
      null
    );
  }
  return null;
};

const pickThumbMedia = (product, variant) => {
  const image =
    urlFromAny(variant?.images?.[0]) ||
    urlFromAny(product?.image) ||
    null;

  const video =
    urlFromAny(variant?.videos?.[0]) ||
    urlFromAny(product?.videos?.[0]) ||
    null;

  return {
    image,
    video,
    poster: image || PLACEHOLDER_IMG,
  };
};



// ===== API BASE (works in dev + prod) =====
const API_ORIGIN = (
  import.meta.env?.VITE_BACKEND_URL ||
  // sensible dev fallback
  (window?.location?.hostname === "localhost" || window?.location?.hostname === "127.0.0.1"
    ? "http://127.0.0.1:5002"
    : "")
).replace(/\/api\/?$/, "");

if (!API_ORIGIN) {
  console.warn("VITE_BACKEND_URL is missing. Set it to https://api.pleasantpearl.com");
}



const DEBUG = true;
const log = (...a) => DEBUG && console.log("[PlaceOrder]", ...a);

const explainAxiosError = (err) => {
  if (!err) return "Unknown error";
  if (err.response) {
    const { status, statusText, data } = err.response;
    return `HTTP ${status} ${statusText} — ${typeof data === "string" ? data : (data?.message || JSON.stringify(data))}`;
  }
  if (err.request) {
    return "No response from server (network/CORS/timeout).";
  }
  return err.message || "Unknown error";
};


const PlaceOrder = () => {
  const { cartItems, products, currency, delivery_fee, clearCart } = useContext(ShopContext);
  const [cartData, setCartData] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const navigate = useNavigate();
  const [formErrors, setFormErrors] = useState({});

  // Default payment method changed to online ("jazz")
  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
    address: "",
    city: "",
    state: "", // will be selected from dropdown
    note: "",
    paymentMethod: "jazz", // default = JazzCash / Easypaisa
    transactionRef: "",
    senderLast4: "",
  });

  const [file, setFile] = useState(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState(null);
  const [missingModalOpen, setMissingModalOpen] = useState(false);
  const [missingList, setMissingList] = useState([]);

  const paymentDetails = {
    bankName: "United Bank Limited (UBL)",
    accountName: "Ramsha",
    accountNumber: "0358320334964",
    iban: "PK26UNIL0109000320334964",
    jazzName: "Rimshah",
    jazzNumber: "03082650680",
    easypaisaName: "Mehak Mushtaq",
    easypaisaNumber: "03082650680",
  };

  // Map cart items to cart data
useEffect(() => {
  const items = (cartItems || [])
    .map((ci) => {
      if (!ci || !ci.productId) return null;
      const product = products?.find((p) => String(p._id) === String(ci.productId));
      if (!product) return null;

      // find variant
      let variant = null;
      if (ci.variantId) {
        variant = product.variants?.find((v) => String(v._id) === String(ci.variantId));
      }
      if (!variant && ci.variantColor) {
        variant = product.variants?.find(
          (v) => (v.color || "").toLowerCase() === String(ci.variantColor).toLowerCase()
        );
      }

      const variantColor = String(variant?.color ?? ci.variantColor ?? "").trim();
      const { image, video, poster } = pickThumbMedia(product, variant);

      const unitPrice = product.finalPrice ?? product.price ?? 0;
      const quantity = Math.max(0, Number(ci.quantity || 0));

      // ✅ NEW: engraving fields (from ShopContext cart line)
      const engravingFirstName = (ci.engravingFirstName || "").trim();
      const engravingLastName  = (ci.engravingLastName  || "").trim();

      // ✅ Prefer cartKey if present; else build a deterministic key including names
      const cartKey =
        ci.cartKey ||
        `${ci.productId}__${ci.variantId || variantColor || "default"}__fn_${engravingFirstName.toLowerCase()}__ln_${engravingLastName.toLowerCase()}`;

      return {
        _id: cartKey,                 // ✅ was `${ci.productId}_${variantColor}`, now a stable-by-name key
        productId: ci.productId,
        variantId: ci.variantId || null,
        name: product.name,
        image,
        video,
        poster,
        variantColor,
        unitPrice,
        quantity,
        total: unitPrice * quantity,

        // ✅ keep for payload + UI
        engravingFirstName,
        engravingLastName,
      };
    })
    .filter(Boolean);

  setCartData(items);
}, [cartItems, products]);

  const subtotal = cartData.reduce((s, it) => s + (Number(it.total) || 0), 0);
  const shipping = subtotal >= 3000 ? 0 : Number(delivery_fee || 0);
  const total = subtotal + shipping;

  // Advance: if COD -> half, else full
  const advanceAmount = form.paymentMethod === "cod" ? Math.round(total / 2) : total;

  // --- Validation helpers ---
  const isValidPakPhone = (p) => {
    if (!p) return false;
    return /^\+923\d{9}$/.test(p.toString().trim());
  };

  // Require a domain dot after @ (e.g. user@domain.com)
  const isValidEmail = (e) => {
    if (!e || typeof e !== "string") return false;
    // Basic RFC-lite validation: non-space + @ + non-space + . + at least 2 letters
    return /^\S+@\S+\.[A-Za-z]{2,}$/.test(e.trim());
  };

  // Update form and clear errors as appropriate
  const handleInput = (e) => {
    const { name, value, type } = e.target;
    setForm((p) => ({ ...p, [name]: value }));

    // live validation for email
    if (name === "email") {
      setFormErrors((prev) => ({ ...prev, email: isValidEmail(value) ? "" : "Please enter a valid email (example: name@example.com)" }));
    }
  };

  const handleFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const allowed = ["image/jpeg", "image/png", "application/pdf"];
    if (!allowed.includes(f.type)) {
      toast.error("Only JPG, PNG, or PDF files are allowed");
      return;
    }
    if (f.size > 5 * 1024 * 1024) {
      toast.error("Maximum file size is 5MB");
      return;
    }
    setFile(f);
    if (f.type.startsWith("image/")) {
      const url = URL.createObjectURL(f);
      setFilePreviewUrl(url);
    } else {
      setFilePreviewUrl(null);
    }
  };

  const removeFile = () => {
    setFile(null);
    if (filePreviewUrl) {
      URL.revokeObjectURL(filePreviewUrl);
      setFilePreviewUrl(null);
    }
  };

  const copyToClipboard = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Failed to copy");
    }
  };

  const getMissingFields = () => {
    const missing = [];
    if (!file) missing.push("Payment screenshot (required)");
    if (!form.transactionRef || form.transactionRef.trim().length < 3) missing.push("Transaction reference");
    if (!form.senderLast4 || form.senderLast4.trim().length !== 4) missing.push("Last 4 digits of sender account/phone");
    return missing;
  };

  // --- Place order ---
 // --- Place order ---
const handlePlaceOrder = async (e) => {
  e.preventDefault();

  if (cartData.length === 0) {
    toast.error("Your cart is empty.");
    return;
  }
  if (!isValidEmail(form.email)) {
    setFormErrors((prev) => ({ ...prev, email: "Please enter a valid email (example: name@example.com)" }));
    toast.error("Please correct form errors before proceeding.");
    return;
  }
  if (!form.state) {
    toast.error("Please select a state/province.");
    return;
  }

  const proofRequired = ["cod", "bank", "jazz"].includes(form.paymentMethod);
  if (proofRequired) {
    const missing = getMissingFields();
    if (missing.length > 0) {
      setMissingList(missing);
      setMissingModalOpen(true);
      return;
    }
  }

  setIsSubmitting(true);

  try {
    const itemsPayload = cartData.map((it) => ({
      productId: it.productId,
      key: it._id,
      name: it.name,
      image: it.image || it.poster,
      variantColor: it.variantColor || "",
      quantity: Number(it.quantity),
      unitPrice: Number(it.unitPrice),
      total: Number(it.total),
      engravingFirstName: it.engravingFirstName || "",
      engravingLastName:  it.engravingLastName  || "",
    }));

    const advanceAmount = form.paymentMethod === "cod" ? Math.round(total / 2) : total;

    const orderPayload = {
      name: form.name,
      phone: form.phone,
      email: form.email,
      address: form.address,
      city: form.city,
      state: form.state,
      note: form.note,
      paymentMethod: form.paymentMethod,
      transactionRef: form.transactionRef,
      senderLast4: form.senderLast4,
      items: itemsPayload,
      subtotal,
      shipping,
      total,
      advanceRequired: advanceAmount,
      paymentInstructions: { bank: paymentDetails },
    };

    console.log("[PlaceOrder] CREATE order…", orderPayload);

    // Create order
    const createRes =await axios.post(`${API_ORIGIN}/api/order/place-manual`, orderPayload, { timeout: 60000 });

    if (!createRes?.data?.success) throw new Error(createRes?.data?.message || "Order creation failed");
    const orderId = createRes.data.orderId || createRes.data.order?._id || createRes.data.order?.id;
    if (!orderId) throw new Error("Order ID missing from server response");

    // Upload proof
    if (file) {
      const fd = new FormData();
      fd.append("proof", file);
      fd.append("orderId", orderId);
      if (form.transactionRef) fd.append("transactionRef", form.transactionRef);
      if (form.senderLast4) fd.append("senderLast4", form.senderLast4);

      console.log("[PlaceOrder] UPLOAD proof…", { orderId, transactionRef: form.transactionRef, senderLast4: form.senderLast4 });

      const uploadRes = await axios.post(
    `${API_ORIGIN}/api/order/upload-proof`,
    fd,
    {
      timeout: 60000,
      withCredentials: false, // ✅ prevents CORS problems
      headers: {
        Accept: "*/*" // ✅ DO NOT SET Content-Type yourself
      }
    }
  );

      if (!uploadRes.data.success) {
        throw new Error(uploadRes.data.message || "Failed to upload payment proof");
      }
      console.log("[PlaceOrder] UPLOAD success:", uploadRes.data);
    }

    // Decrement stock (background)
    (async () => {
      try {
        await Promise.allSettled(
          itemsPayload.map((it) =>
            axios.post(`${API_ORIGIN}/api/product/decrement-stock`, {
              productId: it.productId,
              color: String(it.variantColor || "").trim(),
              quantity: Number(it.quantity || 0),
            })
          )
        );
      } catch (err) {
        console.warn("[PlaceOrder] decrement-stock error:", err);
      }
    })();

    toast.success("Order placed successfully!");
    clearCart();
    const q = new URLSearchParams({
      name: form.name || "Customer",
      amount: advanceAmount.toFixed(2),
      orderId,
    }).toString();
    
    const thankYouUrl = `/thank-you?${q}`;
    console.log("Navigating to:", thankYouUrl);
    window.location.href = thankYouUrl;
    
    // navigate(`/thank-you?${q}`);
  } catch (err) {
    console.error("[PlaceOrder] Error:", err);
    toast.error(err.message || "Failed to place order");
  } finally {
    setIsSubmitting(false);
  }
};

  const proofRequired = ["cod", "bank", "jazz"].includes(form.paymentMethod);
  const canSubmit =
    cartData.length > 0 &&
    (!proofRequired || (file && form.transactionRef && form.senderLast4 && form.senderLast4.trim().length === 4)) &&
    isValidEmail(form.email);

    // put these above the component (reuse your PLACEHOLDER_IMG if you like)
// const urlFromAny = (val) => {
//   if (!val) return null;
//   if (typeof val === "string") return val;
//   if (Array.isArray(val)) {
//     for (const it of val) {
//       const u = urlFromAny(it);
//       if (u) return u;
//     }
//     return null;
//   }
//   if (typeof val === "object") {
//     return (
//       urlFromAny(val.secure_url) ||
//       urlFromAny(val.url) ||
//       urlFromAny(val.src) ||
//       urlFromAny(val.path) ||
//       urlFromAny(val.image) ||
//       null
//     );
//   }
//   return null;
// };

// const pickThumbMedia = (product, variant) => {
//   const image =
//     urlFromAny(variant?.images?.[0]) ||
//     urlFromAny(product?.image) ||
//     null;

//   const video =
//     urlFromAny(variant?.videos?.[0]) ||
//     urlFromAny(product?.videos?.[0]) ||
//     null;

//   return {
//     image,
//     video,
//     poster: image || PLACEHOLDER_IMG, // poster for video + last-resort placeholder
//   };
// };


  return (
    <div className="max-w-6xl mx-auto px-2 py-5">
      {/* Missing Info Modal */}
      {missingModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMissingModalOpen(false)}></div>
          <motion.div initial={{ scale: 0.98, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="relative z-10 max-w-lg w-full bg-white rounded-lg shadow-xl p-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-3">Additional Information Required</h3>
            <div className="mb-4 text-gray-600">
              <p className="mb-3">We need the following information to process your order:</p>
              <ul className="list-disc pl-5 space-y-1">{missingList.map((m, i) => <li key={i}>{m}</li>)}</ul>
              <p className="mt-3 text-sm text-gray-500">If you need assistance, please contact customer support.</p>
            </div>
            <div className="flex justify-end">
              <button onClick={() => setMissingModalOpen(false)} className="px-4 py-2 rounded bg-amber-600 text-white hover:bg-amber-700 transition-colors">Okay</button>
            </div>
          </motion.div>
        </div>
      )}

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-white p-2 rounded-lg shadow-lg">
        <h2 className="text-2xl font-bold text-gray-800 mb-6">Complete Your Order</h2>

        <div className="flex flex-col lg:flex-row gap-8">
          {/* Left Column - Order Form */}
          <div className="flex-1">
            <form onSubmit={handlePlaceOrder} className="space-y-6">
              {/* Contact Information */}
              <div className="bg-gray-50 p-5 rounded-lg border border-gray-200">
                <h3 className="text-lg font-semibold mb-4 text-gray-700">Contact Information</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                    <input name="name" value={form.name} onChange={handleInput} required className="w-full p-3 border border-gray-300 rounded-md focus:ring-amber-500 focus:border-amber-500" />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
                    <PhoneInput
                      country={"pk"}
                      onlyCountries={["pk"]}
                      disableDropdown={true}
                      countryCodeEditable={false}
                      value={form.phone}
                      onChange={(value) => {
                        const formatted = value.startsWith("+") ? value : `+${value}`;
                        setForm((prev) => ({ ...prev, phone: formatted }));
                        if (!isValidPakPhone(formatted)) {
                          setFormErrors((prev) => ({ ...prev, phone: "Please enter a valid Pakistani mobile number." }));
                        } else {
                          setFormErrors((prev) => ({ ...prev, phone: "" }));
                        }
                      }}
                      inputClass={`w-full p-3 border rounded-md focus:ring-amber-500 focus:border-amber-500 ${formErrors.phone ? "border-red-400" : "border-gray-300"}`}
                      inputProps={{ name: "phone", required: true }}
                    />
                    {formErrors.phone && <p className="text-xs text-red-600 mt-1">{formErrors.phone}</p>}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
                    <input
                      name="email"
                      value={form.email}
                      onChange={handleInput}
                      required
                      type="email"
                      className={`w-full p-3 border ${formErrors.email ? "border-red-400" : "border-gray-300"} rounded-md focus:ring-amber-500 focus:border-amber-500`}
                    />
                    {formErrors.email && <p className="text-xs text-red-600 mt-1">{formErrors.email}</p>}
                  </div>
                </div>
              </div>

              {/* Shipping Address */}
              <div className="bg-gray-50 p-5 rounded-lg border border-gray-200">
                <h3 className="text-lg font-semibold mb-4 text-gray-700">Shipping Address</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Full Address</label>
                    <textarea name="address" value={form.address} onChange={handleInput} required rows={3} className="w-full p-3 border border-gray-300 rounded-md focus:ring-amber-500 focus:border-amber-500" />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
                      <input name="city" value={form.city} onChange={handleInput} required className="w-full p-3 border border-gray-300 rounded-md focus:ring-amber-500 focus:border-amber-500" />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">State/Province</label>
                      <select
                        name="state"
                        value={form.state}
                        onChange={handleInput}
                        required
                        className="w-full p-3 border border-gray-300 rounded-md focus:ring-amber-500 focus:border-amber-500"
                      >
                        <option value="">Select state / province</option>
                        {PAK_PROVINCES.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Order Notes (Optional)</label>
                    <textarea name="note" value={form.note} onChange={handleInput} rows={2} className="w-full p-3 border border-gray-300 rounded-md focus:ring-amber-500 focus:border-amber-500" />
                  </div>
                </div>
              </div>

              {/* Payment Method */}
              <div className="bg-gray-50 p-5 rounded-lg border border-gray-200">
                <h3 className="text-lg font-semibold mb-4 text-gray-700">Payment Method</h3>

                <div className="space-y-4">
                  <div className="border rounded-md p-4 hover:border-amber-500 transition-colors">
                    <label className="flex items-start">
                      <input type="radio" name="paymentMethod" value="cod" checked={form.paymentMethod === "cod"} onChange={handleInput} className="mt-1 mr-3" />
                      <div className="flex-1">
                        <div className="font-medium">Cash on Delivery</div>
                        <div className="text-sm text-gray-600 mt-1">Pay <strong>50% advance</strong> now; remaining amount will be collected on delivery.</div>
                      </div>
                    </label>
                  </div>

                  <div className="border rounded-md p-4 hover:border-amber-500 transition-colors">
                    <label className="flex items-start">
                      <input type="radio" name="paymentMethod" value="bank" checked={form.paymentMethod === "bank"} onChange={handleInput} className="mt-1 mr-3" />
                      <div className="flex-1">
                        <div className="font-medium">Bank Transfer</div>
                        <div className="text-sm text-gray-600 mt-1">Transfer full amount and upload proof for verification.</div>
                      </div>
                    </label>
                  </div>

                  <div className="border rounded-md p-4 hover:border-amber-500 transition-colors">
                    <label className="flex items-start">
                      <input type="radio" name="paymentMethod" value="jazz" checked={form.paymentMethod === "jazz"} onChange={handleInput} className="mt-1 mr-3" />
                      <div className="flex-1">
                        <div className="font-medium">JazzCash / Easypaisa</div>
                        <div className="text-sm text-gray-600 mt-1">Send to account number and upload proof.</div>
                      </div>
                    </label>
                  </div>
                </div>

                {/* Payment instructions */}
                {form.paymentMethod && (
                  <div className="mt-6 p-4 bg-white rounded-md border border-gray-200">
                    <h4 className="font-medium text-gray-700 mb-3">Payment Instructions</h4>

                    {form.paymentMethod === "cod" ? (
                      <>
    <p className="text-sm text-gray-600 mb-3">
      Please transfer <strong>{currency} {advanceAmount}</strong> now to confirm your order.
    </p>
    <div className="bg-amber-50 p-3 rounded-md mb-4">
      {/* Bank */}
      <div className="text-sm font-medium">{paymentDetails.bankName}</div>
      <div className="text-sm">{paymentDetails.accountName}</div>
      <div className="flex items-center mt-1">
        <div className="text-sm flex-1">Account: {paymentDetails.accountNumber}</div>
        <button
          type="button"
          onClick={() => copyToClipboard(paymentDetails.accountNumber)}
          className="text-xs px-2 py-1 bg-amber-100 text-amber-700 rounded hover:bg-amber-200 transition-colors"
        >
          Copy
        </button>
      </div>
      <div className="text-sm mt-1">IBAN: {paymentDetails.iban}</div>

      {/* JazzCash */}
                <div className="flex items-center mt-2">
                  <div className="text-sm flex-1">
                    JazzCash ({paymentDetails.jazzName}): {paymentDetails.jazzNumber}
                  </div>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(paymentDetails.jazzNumber)}
                    className="text-xs px-2 py-1 bg-amber-100 text-amber-700 rounded hover:bg-amber-200 transition-colors"
                  >
                    Copy
                  </button>
                </div>

                {/* Easypaisa — NEW under COD */}
                <div className="flex items-center mt-2">
                  <div className="text-sm flex-1">
                    Easypaisa ({paymentDetails.easypaisaName}): {paymentDetails.easypaisaNumber}
                  </div>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(paymentDetails.easypaisaNumber)}
                    className="text-xs px-2 py-1 bg-amber-100 text-amber-700 rounded hover:bg-amber-200 transition-colors"
                  >
                    Copy
                  </button>
                </div>
                  </div>
                </>
                    ) : form.paymentMethod === "bank" ? (
                      <div className="bg-amber-50 p-3 rounded-md mb-4">
                        <div className="text-sm font-medium">{paymentDetails.bankName}</div>
                        <div className="text-sm">{paymentDetails.accountName}</div>
                        <div className="flex items-center mt-1">
                          <div className="text-sm flex-1">Account: {paymentDetails.accountNumber}</div>
                          <button type="button" onClick={() => copyToClipboard(paymentDetails.accountNumber)} className="text-xs px-2 py-1 bg-amber-100 text-amber-700 rounded hover:bg-amber-200 transition-colors">Copy</button>
                        </div>
                        <div className="text-sm mt-1">IBAN: {paymentDetails.iban}</div>
                      </div>
                    ) : (
                      <div className="bg-amber-50 p-3 rounded-md mb-4">
                        <div className="flex items-center">
                          <div className="text-sm flex-1">JazzCash ({paymentDetails.jazzName}): {paymentDetails.jazzNumber}</div>
                          <button type="button" onClick={() => copyToClipboard(paymentDetails.jazzNumber)} className="text-xs px-2 py-1 bg-amber-100 text-amber-700 rounded hover:bg-amber-200 transition-colors">Copy</button>
                        </div>

                        <div className="flex items-center mt-2">
                          <div className="text-sm flex-1">Easypaisa ({paymentDetails.easypaisaName}): {paymentDetails.easypaisaNumber}</div>
                          <button type="button" onClick={() => copyToClipboard(paymentDetails.easypaisaNumber)} className="text-xs px-2 py-1 bg-amber-100 text-amber-700 rounded hover:bg-amber-200 transition-colors">Copy</button>
                        </div>
                      </div>
                    )}

                    {/* Upload proof */}
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-gray-700 mb-2">Upload Payment Proof</label>
                      <div className="flex items-center justify-center w-full">
                        <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
                          <div className="flex flex-col items-center justify-center pt-5 pb-6">
                            <svg className="w-8 h-8 mb-4 text-gray-500" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 20 16">
                              <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 13h3a3 3 0 0 0 0-6h-.025A5.56 5.56 0 0 0 16 6.5 5.5 5.5 0 0 0 5.207 5.021C5.137 5.017 5.071 5 5 5a4 4 0 0 0 0 8h2.167M10 15V6m0 0L8 8m2-2 2 2"/>
                            </svg>
                            <p className="mb-2 text-sm text-gray-500"><span className="font-semibold">Click to upload</span> or drag and drop</p>
                            <p className="text-xs text-gray-500">PNG, JPG, PDF (Max 5MB)</p>
                          </div>
                          <input type="file" name="proof" className="hidden" accept=".png,.jpg,.jpeg,.pdf" onChange={handleFile} />
                        </label>
                      </div>

                      {file && (
                        <div className="mt-3 flex items-center justify-between p-3 bg-gray-50 rounded-md">
                          <div className="flex items-center">
                            {filePreviewUrl ? (
                              <img src={filePreviewUrl} alt="preview" className="w-12 h-12 object-cover rounded mr-3" />
                            ) : (
                              <div className="w-12 h-12 bg-gray-200 rounded flex items-center justify-center mr-3">
                                <span className="text-xs">PDF</span>
                              </div>
                            )}
                            <div>
                              <p className="text-sm font-medium text-gray-700">{file.name}</p>
                              <p className="text-xs text-gray-500">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                            </div>
                          </div>
                          <button type="button" onClick={removeFile} className="text-red-600 hover:text-red-800 transition-colors">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                            </svg>
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Transaction Reference</label>
                        <input name="transactionRef" value={form.transactionRef} onChange={handleInput} placeholder="Enter reference code" className="w-full p-3 border border-gray-300 rounded-md focus:ring-amber-500 focus:border-amber-500" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Last 4 Digits</label>
                        <input name="senderLast4" value={form.senderLast4} onChange={handleInput} placeholder="Last 4 digits of sender" maxLength={4} className="w-full p-3 border border-gray-300 rounded-md focus:ring-amber-500 focus:border-amber-500" />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Submit Button */}
              <motion.button type="submit" whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} disabled={!canSubmit || isSubmitting} className={`w-full py-3 rounded-md font-medium text-lg ${(!canSubmit || isSubmitting) ? "bg-gray-300 cursor-not-allowed" : "bg-amber-600 hover:bg-amber-700 text-white"} transition-colors`}>
                {isSubmitting ? "Processing..." : `Place Order & Pay ${currency} ${advanceAmount}`}
              </motion.button>
            </form>
          </div>

          {/* Right Column - Order Summary */}
          <div className="w-full lg:w-96">
            <div className="bg-white rounded-lg border border-gray-200 p-5 sticky top-4">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">Order Summary</h3>

              {/* Cart Items */}
            <div className="mb-4 max-h-64 overflow-y-auto">
                {cartData.map((item) => (
                  <div key={item._id} className="flex items-center py-3 border-b border-gray-100 last:border-b-0">
                    <div className="flex-shrink-0 w-16 h-16 bg-gray-200 rounded-md overflow-hidden">
  {item.image ? (
    <img
      src={item.image}
      alt={item.name}
      className="w-full h-full object-cover"
    />
  ) : item.video ? (
    <video
      src={item.video}
      className="w-full h-full object-cover"
      muted
      playsInline
      preload="metadata"
      poster={item.poster} // fallback poster we built earlier
    />
  ) : (
    <img
      src={item.poster}
      alt="placeholder"
      className="w-full h-full object-cover"
    />
  )}
</div>

                    <div className="ml-4 flex-1">
                      <h4 className="text-sm font-medium text-gray-800">{item.name}</h4>
                      {item.variantColor && (
                        <p className="text-xs text-gray-500">Color: {item.variantColor}</p>
                      )}
                      {(item.engravingFirstName || item.engravingLastName) && (
   <p className="text-[11px] text-gray-600">
     Name: <span className="font-medium">
       {`${item.engravingFirstName || ""} ${item.engravingLastName || ""}`.trim()}
     </span>
   </p>
 )}
                      <div className="flex justify-between items-center mt-1">
                        <span className="text-sm text-gray-600">Qty: {item.quantity}</span>
                        <span className="text-sm font-medium text-gray-800"> {item.total.toFixed(2)} {currency}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Order Totals */}
              <div className="space-y-2 pt-4 border-t border-gray-200">
                <div className="flex justify-between">
                  <span className="text-gray-600">Subtotal</span>
                  <span className="font-medium"> {subtotal.toFixed(2)} {currency}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Shipping</span>
                  <span className="font-medium"> {shipping.toFixed(2)} {currency}</span>
                </div>
                <div className="flex justify-between pt-2 border-t border-gray-200">
                  <span className="text-lg font-semibold text-gray-800">Total</span>
                  <span className="text-lg font-bold text-amber-700">{currency} {total.toFixed(2)}</span>
                </div>
              </div>

              {/* Payment Info */}
              <div className="mt-4 p-3 bg-amber-50 rounded-md">
                {form.paymentMethod === "cod" ? (
                  <p className="text-sm text-amber-800 text-center">For COD you need to pay <strong>50% advance</strong> now to confirm your order.</p>
                ) : (
                  <p className="text-sm text-amber-800 text-center">Please transfer:  {advanceAmount} {currency} and upload proof for verification</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default PlaceOrder;
