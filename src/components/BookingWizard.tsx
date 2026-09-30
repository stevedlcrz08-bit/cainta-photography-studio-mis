import React, { useState, useEffect } from "react";
import { X, Calendar, Clock, Sparkles, Check, ChevronRight, ChevronLeft, CreditCard, Camera, Info, Upload, AlertTriangle, QrCode, Zap } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { SoundEngine } from "../utils/soundEffects.ts";
import GCashQRModal from "./GCashQRModal.tsx";
import { apiRequest, ApiError } from "../utils/apiClient.ts";


interface BookingWizardProps {
  studio: any;
  services: any[];
  packages: any[];
  addons: any[];
  currentUser: any | null;
  onClose: () => void;
  onSuccess: (bookingId: string) => void;
  initialDate?: string;
}

export default function BookingWizard({
  studio,
  services,
  packages,
  addons,
  currentUser,
  onClose,
  onSuccess,
  initialDate
}: BookingWizardProps) {
  const [step, setStep] = useState(1);
  const [shutterActive, setShutterActive] = useState(false);

  // Form selections
  const [selectedService, setSelectedService] = useState<any>(services[0] || null);
  const [selectedPackage, setSelectedPackage] = useState<any>(null);
  const [selectedDate, setSelectedDate] = useState<string>(initialDate || "");
  const [selectedTimeSlot, setSelectedTimeSlot] = useState<string>("");
  const [selectedAddons, setSelectedAddons] = useState<{ addonId: string; quantity: number; price: number }[]>([]);
  const [customerNotes, setCustomerNotes] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"GCash" | "Bank Transfer" | "Online Payment">("GCash");
  const [paymentOption, setPaymentOption] = useState<"Downpayment" | "Full Payment">("Downpayment");
  const [downpaymentAmount, setDownpaymentAmount] = useState("");
  const [showDownpaymentModal, setShowDownpaymentModal] = useState(false);
  const [refNo, setRefNo] = useState("");
  const [uploadProof, setUploadProof] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [loading, setLoading] = useState(false);
  // GCash QR payment state
  const [showGCashQR, setShowGCashQR] = useState(false);
  const [gcashBookingId, setGcashBookingId] = useState<string | null>(null);
  const [gcashPaid, setGcashPaid] = useState(false);


  // Real-time existing bookings state to check slot availability
  const [existingBookings, setExistingBookings] = useState<any[]>([]);

  // Fetch bookings for the studio to prevent choosing already booked slots
  useEffect(() => {
    if (studio?.id) {
      apiRequest(`/api/bookings?studioId=${studio.id}`)
        .then(data => {
          if (data.bookings) {
            setExistingBookings(data.bookings);
          }
        })
        .catch(err => console.error("Failed to fetch studio bookings", err));
    }
  }, [studio?.id]);

  function parseTimeToMinutes(timeStr: string): number {
    if (!timeStr) return 540; // Default 9:00 AM
    const clean = timeStr.trim().toUpperCase();
    const isPM = clean.includes("PM");
    const isAM = clean.includes("AM");
    const numbers = clean.replace(/[^0-9:]/g, "");
    const parts = numbers.split(":");
    let hours = parseInt(parts[0], 10) || 9;
    const minutes = parseInt(parts[1], 10) || 0;

    if (isPM && hours < 12) hours += 12;
    if (isAM && hours === 12) hours = 0;

    return hours * 60 + minutes;
  }

  const isSlotBooked = (slot: string) => {
    if (!selectedDate) return false;
    
    // Determine duration of currently selecting booking
    let shootDuration = 60;
    if (selectedPackage) {
      shootDuration = selectedPackage.durationMinutes || 60;
    } else if (selectedService) {
      shootDuration = selectedService.durationMinutes || 60;
    }

    const newStartMinutes = parseTimeToMinutes(slot);
    const newEndMinutes = newStartMinutes + shootDuration;

    return existingBookings.some((b: any) => {
      // Must match date and not be Cancelled/Rejected
      if (b.bookingDate !== selectedDate) return false;
      if (["Cancelled", "Rejected", "Expired"].includes(b.status)) return false;

      // Determine duration of existing booking
      let existingDuration = 60;
      if (b.packageId) {
        const p = packages.find(pkg => pkg.id === b.packageId);
        if (p?.durationMinutes) existingDuration = p.durationMinutes;
      } else if (b.serviceId) {
        const s = services.find(srv => srv.id === b.serviceId);
        if (s?.durationMinutes) existingDuration = s.durationMinutes;
      }

      const existingStart = parseTimeToMinutes(b.timeSlot);
      const existingEnd = existingStart + existingDuration;

      // Interval overlap check
      return newStartMinutes < existingEnd && newEndMinutes > existingStart;
    });
  };

  // Auto set date for next available day (e.g. tomorrow)
  useEffect(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    setSelectedDate(tomorrow.toISOString().split("T")[0]);
  }, []);

  // Clear selected slot if it becomes booked on the selected date
  useEffect(() => {
    if (selectedTimeSlot && isSlotBooked(selectedTimeSlot)) {
      setSelectedTimeSlot("");
    }
  }, [selectedDate, selectedTimeSlot, existingBookings]);

  const triggerShutterEffect = (callback: () => void) => {
    setShutterActive(true);
    SoundEngine.playShutter();
    setTimeout(() => {
      callback();
    }, 250);
    setTimeout(() => {
      setShutterActive(false);
    }, 500);
  };

  const handleNextStep = () => {
    if (step === 1 && !selectedService) return;
    if (step === 3 && (!selectedDate || !selectedTimeSlot)) {
      setErrorMsg("Please select both a date and an available time slot.");
      return;
    }
    setErrorMsg("");
    setSuccessMsg("");
    triggerShutterEffect(() => {
      setStep(prev => prev + 1);
    });
  };

  const handlePrevStep = () => {
    setErrorMsg("");
    setSuccessMsg("");
    triggerShutterEffect(() => {
      setStep(prev => prev - 1);
    });
  };

  const handleAddonToggle = (addon: any) => {
    const exists = selectedAddons.find(a => a.addonId === addon.id);
    if (exists) {
      setSelectedAddons(prev => prev.filter(a => a.addonId !== addon.id));
    } else {
      setSelectedAddons(prev => [...prev, { addonId: addon.id, quantity: 1, price: addon.price }]);
    }
  };

  // Calculate prices
  const packagePrice = selectedPackage ? selectedPackage.price : (selectedService?.basePrice || 0);
  const addonsTotal = selectedAddons.reduce((sum, a) => sum + (a.price * a.quantity), 0);
  const totalAmount = packagePrice + addonsTotal;

  // Handle proof of payment base64 upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith("image/") || file.size > 8 * 1024 * 1024) {
        setErrorMsg("Please choose an image smaller than 8 MB.");
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setUploadProof(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleConfirmBooking = async () => {
    if (!currentUser) {
      setErrorMsg("Please log in to complete your booking.");
      return;
    }
    const expectedPaymentAmount = paymentOption === "Full Payment" ? totalAmount : Math.round(totalAmount * 0.3 * 100) / 100;
    if (!downpaymentAmount || Math.abs(Number(downpaymentAmount) - expectedPaymentAmount) > 0.01) {
      setErrorMsg(`Please enter the exact ${paymentOption === "Full Payment" ? "full payment" : "downpayment"} amount of ₱${expectedPaymentAmount.toLocaleString()} PHP.`);
      return;
    }
    if (paymentMethod !== "GCash" && (!refNo.trim() || !uploadProof)) {
      setErrorMsg("Reference number and proof of payment screenshot are required for this payment method.");
      return;
    }

    setLoading(true);
    setErrorMsg("");

    const bookingPayload = {
      studioId: studio.id,
      customerId: currentUser.id,
      serviceId: selectedService.id,
      packageId: selectedPackage?.id,
      bookingDate: selectedDate,
      timeSlot: selectedTimeSlot,
      addons: selectedAddons,
      customerDetails: {
        fullName: currentUser.fullName,
        email: currentUser.email,
        phone: currentUser.contactNumber || "+63 900 000 0000",
        notes: customerNotes
      },
      totalAmount,
      paymentOption
    };

    try {
      // 1. Submit Booking (performs real-time double booking check)
      const data = await apiRequest("/api/bookings", {
        method: "POST",
        body: bookingPayload
      });

      const bookingId = data.booking.id;

      // If GCash QR payment is selected, launch the QR payment modal directly
      if (paymentMethod === "GCash") {
        setShowDownpaymentModal(false);
        setGcashBookingId(bookingId);
        setShowGCashQR(true);
        return;
      }

      // 2. Record payment for manual / cash methods using the customer-selected payment mode
      const selectedPaymentAmount = paymentOption === "Full Payment" ? data.booking.totalAmount : data.booking.downPaymentAmount;
      const paymentData = await apiRequest("/api/payments", {
        method: "POST",
        body: {
          bookingId,
          amount: selectedPaymentAmount,
          paymentType: paymentOption,
          paymentMethod,
          referenceNumber: refNo,
          proofOfPayment: uploadProof
        }
      });

      // Success animation trigger
      SoundEngine.playSuccess();
      setSuccessMsg(`Booking confirmed! Your ${paymentOption === "Full Payment" ? "full payment" : "downpayment"} has been submitted for studio review. Booking ID: ${bookingId}.`);
      setErrorMsg("");
      triggerShutterEffect(() => {
        onSuccess(bookingId);
      });

    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || "Something went wrong. The date slot might be blocked — please try a different time.");
    } finally {
      setLoading(false);
    }
  };

  const stepsList = ["Service", "Package", "Schedule", "Add-ons", "Summary", "Payment"];

  return (
    <div className="fixed inset-0 z-50 overflow-hidden flex justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Shutter Animation Effect overlay - Sleek Minimalist Viewfinder Focus */}
      <AnimatePresence>
        {shutterActive && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="absolute inset-0 bg-zinc-950/95 backdrop-blur-md z-50 flex flex-col items-center justify-center text-white"
          >
            <div className="relative w-48 h-48 flex items-center justify-center">
              {/* Corner brackets simulating photography viewfinder */}
              <div className="absolute top-0 left-0 w-6 h-6 border-t-2 border-l-2 border-amber-400" />
              <div className="absolute top-0 right-0 w-6 h-6 border-t-2 border-r-2 border-amber-400" />
              <div className="absolute bottom-0 left-0 w-6 h-6 border-b-2 border-l-2 border-amber-400" />
              <div className="absolute bottom-0 right-0 w-6 h-6 border-b-2 border-r-2 border-amber-400" />
              
              {/* Pulsing autofocus circular reticle */}
              <motion.div 
                animate={{ 
                  scale: [0.85, 1.05, 0.85],
                  borderColor: ["rgba(251, 191, 36, 0.4)", "rgba(16, 185, 129, 0.8)", "rgba(251, 191, 36, 0.4)"]
                }}
                transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }}
                className="w-24 h-24 rounded-full border-2 border-dashed flex items-center justify-center"
              >
                {/* Micro focus point dot */}
                <motion.div 
                  animate={{ scale: [1, 1.4, 1] }}
                  transition={{ repeat: Infinity, duration: 0.75 }}
                  className="w-3 h-3 rounded-full bg-emerald-500 shadow-lg shadow-emerald-500/50" 
                />
              </motion.div>
            </div>
            
            <div className="mt-6 text-center space-y-1">
              <p className="font-mono text-xs tracking-[0.3em] text-zinc-400 uppercase">System Calibration</p>
              <h4 className="font-display text-lg font-bold text-white tracking-widest uppercase">Capturing Step...</h4>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Slide-out Panel */}
      <motion.div
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "spring", damping: 30, stiffness: 300 }}
        className="relative bg-[#faf9f6] w-full max-w-xl h-full shadow-2xl flex flex-col z-10 border-l border-[#e5e1da]"
      >
        {/* Header */}
        <div className="bg-[#2c2a29] text-white p-5 flex items-center justify-between border-b border-white/10 shadow-md">
          <div>
            <span className="text-[10px] uppercase tracking-wider text-yellow-500 font-bold">Studio Booking Engine</span>
            <h3 className="font-display text-lg font-bold text-[#faf9f6] leading-tight">{studio.name}</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-white/10 text-white transition-colors cursor-pointer">
            <X size={20} />
          </button>
        </div>

        {/* Step progress indicators */}
        <div className="bg-white border-b border-[#e5e1da] px-5 py-3 flex justify-between items-center text-xs">
          {stepsList.map((st, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <span className={`w-5.5 h-5.5 rounded-full flex items-center justify-center font-bold text-[10px] ${
                step === i + 1 
                  ? "bg-[#2c2a29] text-white" 
                  : step > i + 1 
                  ? "bg-green-600 text-white" 
                  : "bg-[#e5e1da] text-[#7c756d]"
              }`}>
                {step > i + 1 ? <Check size={10} /> : i + 1}
              </span>
              <span className={`hidden sm:inline font-medium ${step === i + 1 ? "text-[#2c2a29]" : "text-[#7c756d]"}`}>{st}</span>
              {i < stepsList.length - 1 && <span className="hidden sm:inline text-gray-300">/</span>}
            </div>
          ))}
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {errorMsg && (
            <div className="bg-red-50 border border-red-200 text-red-800 p-4 rounded-xl flex items-start gap-3 shadow-sm">
              <AlertTriangle className="text-red-600 flex-shrink-0 mt-0.5" size={18} />
              <div className="text-xs font-semibold">{errorMsg}</div>
            </div>
          )}

          {successMsg && (
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-4 rounded-xl flex items-start gap-3 shadow-sm">
              <Check className="text-emerald-600 flex-shrink-0 mt-0.5" size={18} />
              <div className="text-xs font-semibold">{successMsg}</div>
            </div>
          )}

          {/* STEP 1: Select Service */}
          {step === 1 && (
            <div className="space-y-4">
              <h4 className="font-display text-lg font-bold text-[#2c2a29]">Choose a Photography Service</h4>
              <p className="text-xs text-[#7c756d]">Our base sessions are tailored specifically to Cainta students, milestones, and corporations.</p>
              
              <div className="grid gap-3">
                {services.map((srv) => (
                  <div
                    key={srv.id}
                    onClick={() => setSelectedService(srv)}
                    className={`p-4 rounded-xl border-2 flex gap-4 cursor-pointer transition-all ${
                      selectedService?.id === srv.id 
                        ? "border-[#2c2a29] bg-white shadow-md scale-[1.01]" 
                        : "border-[#e5e1da] bg-white hover:border-[#7c756d]/50"
                    }`}
                  >
                    <img src={srv.image} alt={srv.name} className="w-16 h-16 rounded-lg object-cover" />
                    <div className="flex-1 text-left">
                      <div className="flex justify-between items-start">
                        <h5 className="font-semibold text-sm text-[#2c2a29]">{srv.name}</h5>
                        <span className="font-bold text-sm text-[#2c2a29]">{srv.basePrice} PHP</span>
                      </div>
                      <p className="text-[11px] text-[#7c756d] mt-1 line-clamp-2">{srv.description}</p>
                      <div className="flex gap-4 mt-2 text-[10px] text-[#7c756d] font-medium">
                        <span>Duration: {srv.durationMinutes} mins</span>
                        <span>Category: {srv.category}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* STEP 2: Select Package */}
          {step === 2 && (
            <div className="space-y-4">
              <h4 className="font-display text-lg font-bold text-[#2c2a29]">Choose a Package (Optional)</h4>
              <p className="text-xs text-[#7c756d]">Book the selected service only, or choose a package with additional deliverables.</p>

              <div className="grid gap-3">
                <div
                  onClick={() => setSelectedPackage(null)}
                  className={`p-4 rounded-xl border-2 flex gap-4 cursor-pointer transition-all ${
                    !selectedPackage
                      ? "border-[#2c2a29] bg-white shadow-md scale-[1.01]"
                      : "border-[#e5e1da] bg-white hover:border-[#7c756d]/50"
                  }`}
                >
                  <div className="w-16 h-16 rounded-lg bg-[#f2efe9] flex items-center justify-center text-[#2c2a29]">
                    <Camera size={24} />
                  </div>
                  <div className="flex-1 text-left">
                    <div className="flex justify-between items-start">
                      <h5 className="font-semibold text-sm text-[#2c2a29]">Service only</h5>
                      <span className="font-bold text-sm text-[#2c2a29]">{selectedService?.basePrice || 0} PHP</span>
                    </div>
                    <p className="text-[11px] text-[#7c756d] mt-1">Pay only for the service you selected.</p>
                  </div>
                </div>
                {packages.map((pkg) => (
                  <div
                    key={pkg.id}
                    onClick={() => setSelectedPackage(pkg)}
                    className={`p-4 rounded-xl border-2 flex gap-4 cursor-pointer transition-all ${
                      selectedPackage?.id === pkg.id 
                        ? "border-[#2c2a29] bg-white shadow-md scale-[1.01]" 
                        : "border-[#e5e1da] bg-white hover:border-[#7c756d]/50"
                    }`}
                  >
                    <img src={pkg.image} alt={pkg.name} className="w-16 h-16 rounded-lg object-cover" />
                    <div className="flex-1 text-left">
                      <div className="flex justify-between items-start">
                        <h5 className="font-semibold text-sm text-[#2c2a29]">{pkg.name}</h5>
                        <span className="font-bold text-sm text-[#2c2a29]">{pkg.price} PHP</span>
                      </div>
                      <p className="text-[11px] text-[#7c756d] mt-1 line-clamp-2">{pkg.description}</p>
                      <div className="grid grid-cols-2 gap-y-1 gap-x-4 mt-3 pt-2.5 border-t border-dashed border-gray-100 text-[10px] text-[#7c756d]">
                        <div>• Edited photos: {pkg.editedPhotosCount}</div>
                        <div>• Photographers: {pkg.photographerCount}</div>
                        <div className="col-span-2">• Prints: {pkg.includedPrints}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* STEP 3: Choose Schedule */}
          {step === 3 && (
            <div className="space-y-4">
              <h4 className="font-display text-lg font-bold text-[#2c2a29]">Select Date & Available Time Slot</h4>
              <p className="text-xs text-[#7c756d]">Our double-booking engine prevents timing clashes automatically.</p>

              <div className="space-y-3 text-left">
                <label className="block text-xs font-semibold text-[#2c2a29]">Preferred Shoot Date</label>
                <div className="relative">
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={e => setSelectedDate(e.target.value)}
                    min={new Date().toISOString().split("T")[0]}
                    className="w-full bg-white border border-[#e5e1da] rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#2c2a29]"
                  />
                </div>
              </div>

              <div className="space-y-3 text-left">
                <label className="block text-xs font-semibold text-[#2c2a29]">Available Hourly Slots</label>
                <div className="grid grid-cols-3 gap-2">
                  {selectedService?.availableSlots.map((slot: string) => {
                    const booked = isSlotBooked(slot);
                    return (
                      <button
                        key={slot}
                        type="button"
                        disabled={booked}
                        onClick={() => setSelectedTimeSlot(slot)}
                        className={`py-2 px-3 rounded-lg font-semibold text-xs transition-all border ${
                          booked
                            ? "bg-zinc-100 text-zinc-400 border-zinc-200 cursor-not-allowed line-through relative"
                            : selectedTimeSlot === slot 
                            ? "bg-[#2c2a29] text-white border-[#2c2a29] shadow-sm" 
                            : "bg-white text-[#2c2a29] border-[#e5e1da] hover:border-[#7c756d]"
                        }`}
                      >
                        <span>{slot}</span>
                        {booked && (
                          <span className="block text-[8px] text-red-600 font-bold tracking-wider mt-0.5 uppercase">Booked</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* STEP 4: Choose Add-ons */}
          {step === 4 && (
            <div className="space-y-4">
              <h4 className="font-display text-lg font-bold text-[#2c2a29]">Choose Optional Add-ons</h4>
              <p className="text-xs text-[#7c756d]">Add expert hair/makeup stylists, fur companion allowances, or extra print framing options.</p>

              <div className="grid gap-3">
                {addons.map((add) => {
                  const isSelected = selectedAddons.some(a => a.addonId === add.id);
                  return (
                    <div
                      key={add.id}
                      onClick={() => handleAddonToggle(add)}
                      className={`p-4 rounded-xl border-2 flex items-center justify-between cursor-pointer transition-all ${
                        isSelected 
                          ? "border-[#2c2a29] bg-white shadow-sm" 
                          : "border-[#e5e1da] bg-white hover:border-[#7c756d]/50"
                      }`}
                    >
                      {add.image && <img src={add.image} alt={add.name} className="w-16 h-16 rounded-lg object-cover flex-shrink-0" />}
                      <div className="text-left pr-4">
                        <h5 className="font-semibold text-sm text-[#2c2a29]">{add.name}</h5>
                        <p className="text-[11px] text-[#7c756d] mt-0.5">{add.description}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-bold text-xs text-[#2c2a29] whitespace-nowrap">+{add.price} PHP</span>
                        <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-colors ${
                          isSelected ? "bg-[#2c2a29] border-[#2c2a29] text-white" : "border-[#e5e1da] bg-white"
                        }`}>
                          {isSelected && <Check size={12} />}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* STEP 5: Booking Summary */}
          {step === 5 && (
            <div className="space-y-5">
              <h4 className="font-display text-lg font-bold text-[#2c2a29]">Confirm Booking Summary</h4>
              <p className="text-xs text-[#7c756d]">Please review all your details carefully before confirming the studio reservation.</p>

              <div className="bg-white border border-[#e5e1da] rounded-2xl p-5 space-y-4 text-left shadow-sm">
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-[#7c756d] font-semibold">Studio Info</span>
                  <p className="text-sm font-bold text-[#2c2a29]">{studio.name}</p>
                </div>
                <div className="grid grid-cols-2 gap-4 border-t border-[#faf9f6] pt-3">
                  <div>
                    <span className="text-[10px] uppercase tracking-wider text-[#7c756d] font-semibold">Service</span>
                    <p className="text-xs font-semibold text-[#2c2a29]">{selectedService?.name}</p>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase tracking-wider text-[#7c756d] font-semibold">Package</span>
                    <p className="text-xs font-semibold text-[#2c2a29]">{selectedPackage?.name || "Service only"}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 border-t border-[#faf9f6] pt-3">
                  <div>
                    <span className="text-[10px] uppercase tracking-wider text-[#7c756d] font-semibold">Date</span>
                    <p className="text-xs font-semibold text-[#2c2a29] flex items-center gap-1"><Calendar size={13} /> {selectedDate}</p>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase tracking-wider text-[#7c756d] font-semibold">Time Slot</span>
                    <p className="text-xs font-semibold text-[#2c2a29] flex items-center gap-1"><Clock size={13} /> {selectedTimeSlot}</p>
                  </div>
                </div>

                {selectedAddons.length > 0 && (
                  <div className="border-t border-[#faf9f6] pt-3">
                    <span className="text-[10px] uppercase tracking-wider text-[#7c756d] font-semibold">Selected Add-ons</span>
                    <ul className="text-xs space-y-1 mt-1 text-[#2c2a29]">
                      {selectedAddons.map((sa) => {
                        const ad = addons.find(a => a.id === sa.addonId);
                        return <li key={sa.addonId}>• {ad?.name} (+{ad?.price} PHP)</li>;
                      })}
                    </ul>
                  </div>
                )}

                <div className="border-t border-[#faf9f6] pt-4 flex justify-between items-center font-bold">
                  <span className="text-sm text-[#2c2a29]">Total amount:</span>
                  <span className="text-lg text-[#2c2a29]">{totalAmount} PHP</span>
                </div>
              </div>

              {/* Notes */}
              <div className="space-y-2 text-left">
                <label className="block text-xs font-semibold text-[#2c2a29]">Additional Notes or Requirements</label>
                <textarea
                  value={customerNotes}
                  onChange={e => setCustomerNotes(e.target.value)}
                  placeholder="Specify custom background colors, dress requests, toga colors, or any notes..."
                  className="w-full bg-white border border-[#e5e1da] rounded-xl p-3 text-xs focus:outline-none focus:border-[#2c2a29] h-20"
                />
              </div>
            </div>
          )}

          {/* STEP 6: Secure Payment */}
          {step === 6 && (
            <div className="space-y-4">
              <h4 className="font-display text-lg font-bold text-[#2c2a29]">Choose Payment Type</h4>
              <p className="text-xs text-[#7c756d]">Pay a 30% downpayment or pay the full booking amount now.</p>

              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: "Downpayment", value: "Downpayment" as const },
                  { label: "Full Payment", value: "Full Payment" as const }
                ].map((choice) => (
                  <button
                    key={choice.value}
                    type="button"
                    onClick={() => {
                      setPaymentOption(choice.value);
                      setDownpaymentAmount(choice.value === "Full Payment" ? String(Math.round(totalAmount * 100) / 100) : String(Math.round(totalAmount * 0.3 * 100) / 100));
                    }}
                    className={`p-3 rounded-xl border text-left transition-all ${paymentOption === choice.value ? "border-[#2c2a29] bg-white shadow-sm" : "border-[#e5e1da] bg-white hover:border-[#7c756d]"}`}
                  >
                    <div className="flex items-center gap-2">
                      <CreditCard size={15} className="text-[#2c2a29]" />
                      <span className="text-xs font-bold text-[#2c2a29]">{choice.label}</span>
                    </div>
                    <div className="mt-2 text-[10px] text-[#7c756d]">
                      {choice.value === "Downpayment"
                        ? `₱${Math.round(totalAmount * 0.3 * 100) / 100}`
                        : `₱${Math.round(totalAmount * 100) / 100}`}
                    </div>
                  </button>
                ))}
              </div>

              {/* Payment Methods */}
              <div className="grid grid-cols-1 gap-2 text-left">
                {(["GCash", "Bank Transfer", "Online Payment"] as const).map((method) => (
                  <button
                    key={method}
                    type="button"
                    onClick={() => setPaymentMethod(method)}
                    className={`p-3 rounded-xl border flex items-center gap-3 cursor-pointer transition-all ${
                      paymentMethod === method
                        ? "border-[#2c2a29] bg-white shadow-sm"
                        : "border-[#e5e1da] bg-white hover:border-[#7c756d]"
                    }`}
                  >
                    <CreditCard size={15} className={paymentMethod === method ? "text-[#2c2a29]" : "text-[#7c756d]"} />
                    <div className="flex-1 text-left">
                      <span className={`text-xs font-bold ${paymentMethod === method ? "text-[#2c2a29]" : "text-[#7c756d]"}`}>{method}</span>
                      {method === "GCash" && <span className="block text-[10px] text-green-600">Instant QR confirmation — no receipt needed</span>}
                      {method === "Bank Transfer" && <span className="block text-[10px] text-[#7c756d]">Upload receipt + reference number required</span>}
                      {method === "Online Payment" && <span className="block text-[10px] text-[#7c756d]">Upload receipt + reference number required</span>}
                    </div>
                    {paymentMethod === method && <Check size={15} className="text-[#2c2a29] flex-shrink-0" />}
                  </button>
                ))}
              </div>

              {paymentMethod !== "GCash" && (
                <div className="bg-white border border-[#e5e1da] rounded-2xl p-5 text-left space-y-4">
                  <div className="text-xs text-[#7c756d]">
                    <span className="font-bold text-[#2c2a29] block mb-1">Transfer instructions:</span>
                    {paymentMethod === "Bank Transfer" && "Use the studio's verified bank instructions. Confirm the recipient and amount, then submit the transaction reference and receipt for studio verification."}
                    {paymentMethod === "Online Payment" && "Complete payment through the configured payment provider, then submit the provider transaction ID and receipt for verification."}
                  </div>

                  <div className="space-y-1">
                    <label className="block text-[11px] font-semibold text-[#2c2a29]">
                      Reference Number <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={refNo}
                      onChange={e => setRefNo(e.target.value)}
                      placeholder="Enter 12-digit transaction ID or reference"
                      className={`w-full bg-[#faf9f6] border rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-[#2c2a29] ${refNo.trim() ? "border-emerald-400" : "border-[#e5e1da]"}`}
                    />
                    {!refNo.trim() && (
                      <p className="text-[10px] text-amber-600 font-semibold">Required to confirm your payment</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <label className="block text-[11px] font-semibold text-[#2c2a29]">
                      Proof of Payment Receipt <span className="text-red-500">*</span>
                    </label>
                    <div className="border-2 border-dashed border-[#e5e1da] rounded-xl p-4 text-center bg-[#faf9f6] relative cursor-pointer hover:border-[#7c756d]/50">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleFileUpload}
                        className="absolute inset-0 opacity-0 cursor-pointer"
                      />
                      {uploadProof ? (
                        <div className="space-y-2">
                          <img src={uploadProof} alt="Receipt preview" className="max-h-24 mx-auto rounded-lg object-contain border border-gray-200" />
                          <div className="flex items-center justify-center gap-2 text-xs text-green-600 font-semibold">
                            <Check size={14} /> Receipt Uploaded — click to change
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center gap-1.5 text-xs text-[#7c756d]">
                          <Upload size={20} />
                          <span className="font-semibold text-[#2c2a29]">Click or drag receipt here to upload</span>
                          <span className="text-[10px] text-red-500 font-semibold">Required to submit booking</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {paymentMethod === "GCash" && (
                <div className="bg-gradient-to-br from-green-950/60 to-green-900/40 border border-green-700/40 rounded-2xl p-5 text-left space-y-4">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-7 h-7 rounded-full bg-[#00a94f] flex items-center justify-center flex-shrink-0">
                      <span className="text-white font-bold text-xs">G</span>
                    </div>
                    <div>
                      <p className="text-white font-bold text-sm">Pay via GCash QR</p>
                      <p className="text-green-400/80 text-[11px]">Instant confirmation · No receipt needed</p>
                    </div>
                    <div className="ml-auto bg-green-500/20 text-green-300 text-[10px] font-bold px-2 py-1 rounded-full border border-green-500/30 flex items-center gap-1">
                      <Zap size={10} /> INSTANT
                    </div>
                  </div>

                  {gcashPaid ? (
                    <div className="flex items-center gap-3 bg-green-900/40 border border-green-600/40 rounded-xl p-3">
                      <Check size={18} className="text-green-400 flex-shrink-0" />
                      <div>
                        <p className="text-green-300 font-bold text-sm">Payment Confirmed!</p>
                        <p className="text-green-400/70 text-xs">Your {paymentOption === "Full Payment" ? "full payment" : "downpayment"} was received via GCash QR. Booking will be confirmed.</p>
                      </div>
                    </div>
                  ) : (
                    <>
                      <ul className="text-green-300/80 text-[11px] space-y-1">
                        <li className="flex items-center gap-2"><QrCode size={12} /> Scan QR code in your GCash app</li>
                        <li className="flex items-center gap-2"><Check size={12} /> Payment confirmed instantly — no manual review</li>
                        <li className="flex items-center gap-2"><Zap size={12} /> Works with GCash, Maya, and all QR Ph apps</li>
                      </ul>
                      <p className="text-green-400/60 text-[10px]">
                        {paymentOption === "Full Payment" ? "Full Payment Amount" : "Downpayment"}: <strong className="text-green-300">₱{paymentOption === "Full Payment" ? Math.round(totalAmount * 100) / 100 : Math.round(totalAmount * 0.3 * 100) / 100}</strong>
                      </p>
                      <p className="text-amber-300/70 text-[10px] italic">
                        Tip: First create your booking (click Confirm below), then the QR will appear.
                      </p>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-5 border-t border-[#e5e1da] bg-white flex justify-between items-center">
          <div className="text-left">
            <span className="text-[10px] text-[#7c756d] uppercase tracking-wider block">{paymentOption === 'Full Payment' ? 'Full payment required' : 'Downpayment Due (30%)'}</span>
            <span className="text-lg font-bold text-[#2c2a29]">{paymentOption === 'Full Payment' ? Math.round(totalAmount * 100) / 100 : Math.round(totalAmount * 0.3 * 100) / 100} PHP</span>
          </div>

          <div className="flex gap-2">
            {step > 1 && (
              <button
                onClick={handlePrevStep}
                className="px-4 py-2 bg-white hover:bg-[#faf9f6] border border-[#e5e1da] text-[#2c2a29] rounded-full text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer"
              >
                <ChevronLeft size={15} /> Back
              </button>
            )}

            {step < 6 ? (
              <button
                onClick={handleNextStep}
                className="px-5 py-2.5 bg-[#2c2a29] hover:bg-[#4a4644] text-white rounded-full text-xs font-semibold flex items-center gap-1 shadow-md transition-all cursor-pointer"
              >
                Next <ChevronRight size={15} />
              </button>
            ) : (
              <button
                onClick={() => {
                  const requiredAmount = paymentOption === "Full Payment" ? Math.round(totalAmount * 100) / 100 : Math.round(totalAmount * 0.3 * 100) / 100;
                  setDownpaymentAmount(String(requiredAmount));
                  setShowDownpaymentModal(true);
                }}
                disabled={loading}
                className="px-6 py-2.5 bg-yellow-500 hover:bg-yellow-400 text-black font-extrabold rounded-full text-xs uppercase tracking-wider shadow-md hover:shadow-lg disabled:opacity-75 transition-all flex items-center justify-center gap-2 cursor-pointer min-w-[190px]"
              >
                {loading ? (
                  <span className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 bg-black rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="w-1.5 h-1.5 bg-black rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="w-1.5 h-1.5 bg-black rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                    <span className="ml-1 text-[10px] font-mono tracking-widest uppercase">Processing</span>
                  </span>
                ) : (
                  <>
                    <span>Confirm Studio Booking</span> 
                    <Sparkles size={14} className="fill-current animate-pulse text-black" />
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </motion.div>

      {/* GCash QR Modal — shown after booking is created */}
      {showGCashQR && gcashBookingId && (
        <GCashQRModal
          isOpen={showGCashQR}
          onClose={() => setShowGCashQR(false)}
          onPaymentSuccess={(_sessionId, _paymentId) => {
            setGcashPaid(true);
            setShowGCashQR(false);
            // Give a moment for the animation then close wizard
            setTimeout(() => onSuccess(gcashBookingId), 1800);
          }}
          bookingId={gcashBookingId}
          studioId={studio?.id}
          amount={paymentOption === 'Full Payment' ? Math.round(totalAmount * 100) / 100 : Math.round(totalAmount * 0.3 * 100) / 100}
          paymentType={paymentOption === 'Full Payment' ? 'Full Payment' : 'Downpayment'}
          studioName={studio?.name || "Studio"}
          description={`${paymentOption === 'Full Payment' ? 'Full Payment' : 'Downpayment'} — ${selectedService?.name || "Booking"}`}
          authToken={currentUser?.authToken || ""}
        />
      )}

      {showDownpaymentModal && (
        <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-[#e5e1da] p-6 space-y-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <span className="text-[10px] uppercase tracking-wider text-amber-600 font-bold">Payment Required</span>
                <h4 className="font-display text-xl font-bold text-[#2c2a29]">Confirm Booking</h4>
                <p className="text-xs text-[#7c756d] mt-1">Your booking will be submitted. Choose how to pay your {paymentOption === "Full Payment" ? "full payment" : "downpayment"}.</p>
              </div>
              <button onClick={() => setShowDownpaymentModal(false)} className="p-1 text-[#7c756d] hover:text-[#2c2a29] cursor-pointer" aria-label="Close downpayment modal">
                <X size={18} />
              </button>
            </div>

            <div className="bg-[#faf9f6] border border-[#e5e1da] rounded-xl p-4 flex justify-between items-center">
              <span className="text-xs text-[#7c756d]">{paymentOption === "Full Payment" ? "Full payment required" : "Required downpayment"}</span>
              <strong className="text-lg text-[#2c2a29]">{(paymentOption === "Full Payment" ? Math.round(totalAmount * 100) / 100 : Math.round(totalAmount * 0.3 * 100) / 100).toLocaleString()} PHP</strong>
            </div>

            <div className="space-y-1 text-left">
              <label className="block text-[11px] font-bold text-[#2c2a29]">{paymentOption === "Full Payment" ? "Payment amount" : "Downpayment amount"}</label>
              <input
                type="number"
                min="0"
                step="0.01"
                required
                value={downpaymentAmount}
                onChange={e => setDownpaymentAmount(e.target.value)}
                className="w-full bg-[#faf9f6] border border-[#e5e1da] rounded-xl px-3 py-3 text-sm font-bold focus:outline-none focus:border-[#2c2a29]"
                placeholder={paymentOption === "Full Payment" ? "Enter full amount in PHP" : "Enter amount in PHP"}
              />
            </div>

            <div className="space-y-1 text-left">
              <label className="block text-[11px] font-bold text-[#2c2a29]">Payment method</label>
              <select
                value={paymentMethod}
                onChange={e => setPaymentMethod(e.target.value as any)}
                className="w-full bg-[#faf9f6] border border-[#e5e1da] rounded-xl px-3 py-3 text-xs focus:outline-none"
              >
                <option value="GCash">GCash (via QR — instant)</option>
                <option value="Bank Transfer">Bank Transfer</option>
                <option value="Online Payment">Online Payment</option>
              </select>
            </div>

            {paymentMethod === "GCash" && (
              <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-xs text-green-800 flex items-start gap-2">
                <QrCode size={14} className="flex-shrink-0 mt-0.5" />
                <span><strong>GCash QR:</strong> After confirming, a scannable QR code will appear. Scan it in your GCash app — no receipt upload needed!</span>
              </div>
            )}

            {paymentMethod !== "GCash" && (
              <>
                <div className="space-y-1 text-left">
                  <label className="block text-[11px] font-bold text-[#2c2a29]">
                    Reference number <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={refNo}
                    onChange={e => setRefNo(e.target.value)}
                    className={`w-full bg-[#faf9f6] border rounded-xl px-3 py-2.5 text-xs focus:outline-none focus:border-[#2c2a29] ${refNo.trim() ? "border-emerald-400" : "border-[#e5e1da]"}`}
                    placeholder="Enter transaction reference number"
                  />
                </div>
                <div className="text-left text-[11px]">
                  <span className="font-bold text-[#2c2a29]">Proof of payment receipt: </span>
                  {uploadProof
                    ? <span className="text-emerald-600 font-bold">✓ Receipt uploaded.</span>
                    : <span className="text-red-600 font-bold">⚠ Receipt required — upload it in the Payment step above.</span>
                  }
                </div>
              </>
            )}

            {/* Error and success messages inside modal */}
            {errorMsg && (
              <div className="bg-red-50 border border-red-200 text-red-800 p-3 rounded-xl flex items-start gap-2 text-xs">
                <AlertTriangle size={14} className="flex-shrink-0 mt-0.5 text-red-500" />
                <span className="font-semibold">{errorMsg}</span>
              </div>
            )}
            {successMsg && (
              <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-3 rounded-xl flex items-start gap-2 text-xs">
                <Check size={14} className="flex-shrink-0 mt-0.5 text-emerald-600" />
                <span className="font-semibold">{successMsg}</span>
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <button onClick={() => { setShowDownpaymentModal(false); setErrorMsg(""); setSuccessMsg(""); }} className="flex-1 py-2.5 border border-[#e5e1da] rounded-xl text-xs font-bold text-[#2c2a29] cursor-pointer">
                Back
              </button>
              <button
                onClick={async () => {
                  setErrorMsg("");
                  setSuccessMsg("");
                  if (paymentMethod === "GCash") {
                    setLoading(true);
                    try {
                      await handleConfirmBooking();
                    } finally {
                      setLoading(false);
                    }
                  } else {
                    handleConfirmBooking();
                  }
                }}
                disabled={loading || !!successMsg}
                className="flex-1 py-2.5 bg-[#2c2a29] text-white rounded-xl text-xs font-bold uppercase tracking-wider disabled:opacity-60 cursor-pointer"
              >
                {loading ? "Processing..." : successMsg ? "✓ Submitted!" : paymentMethod === "GCash" ? "Create Booking & Pay via QR" : paymentOption === "Full Payment" ? "Submit Full Payment" : "Submit Downpayment"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

