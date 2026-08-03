import React, { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { apiRequest } from "@/lib/api";
import { toast } from "@/components/ui/sonner";
import { Calendar, Clock, Users, Phone, User, CheckCircle } from "lucide-react";
import { useParams } from "react-router-dom";

const PublicReservation: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [restaurantName, setRestaurantName] = useState("Restaurant");
  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    date: "",
    time: "",
    guests: "2",
  });

  useEffect(() => {
    // Fetch restaurant info from token
    if (token) {
      apiRequest<any>(`/reservations/public/${token}`, { method: "GET" }, false)
        .then((data) => {
          if (data.restaurant_name) {
            setRestaurantName(data.restaurant_name);
          }
        })
        .catch(() => {
          toast.error("Invalid reservation link");
        });
    }
  }, [token]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    if (!formData.name.trim()) {
      toast.error("Please enter your name");
      return;
    }
    if (!formData.phone || !/^\d{10}$/.test(formData.phone.replace(/\D/g, ""))) {
      toast.error("Please enter a valid 10-digit phone number");
      return;
    }
    if (!formData.date) {
      toast.error("Please select a date");
      return;
    }
    if (!formData.time) {
      toast.error("Please select a time");
      return;
    }
    if (!formData.guests || Number(formData.guests) < 1) {
      toast.error("Please select number of guests");
      return;
    }

    setLoading(true);
    try {
      await apiRequest(
        "/reservations",
        {
          method: "POST",
          body: JSON.stringify({
            customer_name: formData.name,
            customer_phone: formData.phone,
            reservation_date: formData.date,
            reservation_time: formData.time,
            guests: Number(formData.guests),
            source: "public_link",
            token,
          }),
        },
        false
      );

      setSubmitted(true);
      toast.success("Reservation confirmed! We'll see you soon.");
    } catch (err: any) {
      toast.error(err.message || "Failed to create reservation");
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary-50 via-white to-primary-100 flex items-center justify-center p-4">
        <Card className="w-full max-w-md bg-white shadow-xl">
          <CardContent className="p-8 text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="text-green-600" size={32} />
            </div>
            <h2 className="text-2xl font-bold text-gray-800 mb-2">Reservation Confirmed!</h2>
            <p className="text-gray-600 mb-4">
              Thank you for booking with {restaurantName}. We've received your reservation and will confirm it shortly.
            </p>
            <div className="bg-primary-50 p-4 rounded-lg mb-4">
              <p className="text-sm text-gray-700">
                <strong>Name:</strong> {formData.name}
              </p>
              <p className="text-sm text-gray-700">
                <strong>Date:</strong> {new Date(formData.date).toLocaleDateString()}
              </p>
              <p className="text-sm text-gray-700">
                <strong>Time:</strong> {formData.time}
              </p>
              <p className="text-sm text-gray-700">
                <strong>Guests:</strong> {formData.guests}
              </p>
            </div>
            <p className="text-xs text-gray-500">
              A confirmation has been sent to {formData.phone}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 via-white to-primary-100 p-4">
      <div className="max-w-md mx-auto">
        <Card className="bg-white shadow-xl">
          <CardHeader className="bg-gradient-to-r from-primary-500 to-secondary-600 text-white rounded-t-lg">
            <CardTitle className="text-2xl flex items-center gap-2">
              <Calendar size={28} /> Book Your Table
            </CardTitle>
            <p className="text-primary-100 text-sm mt-2">{restaurantName}</p>
          </CardHeader>

          <CardContent className="p-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Name */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  <User size={16} className="inline mr-2" /> Your Name
                </label>
                <Input
                  type="text"
                  name="name"
                  placeholder="Enter your full name"
                  value={formData.name}
                  onChange={handleChange}
                  className="w-full"
                />
              </div>

              {/* Phone */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  <Phone size={16} className="inline mr-2" /> Phone Number
                </label>
                <Input
                  type="tel"
                  name="phone"
                  placeholder="10-digit phone number"
                  value={formData.phone}
                  onChange={handleChange}
                  className="w-full"
                />
              </div>

              {/* Date */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  <Calendar size={16} className="inline mr-2" /> Date
                </label>
                <Input
                  type="date"
                  name="date"
                  value={formData.date}
                  onChange={handleChange}
                  className="w-full"
                  min={new Date().toISOString().split("T")[0]}
                />
              </div>

              {/* Time */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  <Clock size={16} className="inline mr-2" /> Time
                </label>
                <Input
                  type="time"
                  name="time"
                  value={formData.time}
                  onChange={handleChange}
                  className="w-full"
                />
              </div>

              {/* Guests */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  <Users size={16} className="inline mr-2" /> Number of Guests
                </label>
                <select
                  name="guests"
                  value={formData.guests}
                  onChange={handleChange}
                  className="w-full border rounded-md px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                    <option key={num} value={num}>
                      {num} {num === 1 ? "Guest" : "Guests"}
                    </option>
                  ))}
                </select>
              </div>

              {/* Submit Button */}
              <Button
                type="submit"
                disabled={loading}
                className="w-full bg-primary-500 hover:bg-primary-600 text-white font-semibold py-2 mt-6"
              >
                {loading ? "Booking..." : "Confirm Reservation"}
              </Button>
            </form>

            <p className="text-xs text-gray-500 text-center mt-4">
              We'll send a confirmation to your phone number
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default PublicReservation;
